import { entrySlugs, listFileSetFiles, readEntry, readFileSet, readSingleton } from "../core/content";
import type { Ctx } from "../core/content";
import { fsStore } from "../core/store-fs";
import { githubStore } from "../core/store-github";
import { withPathPrefix } from "../core/store-prefix";
import { HttpError, resolveConfig } from "../core/types";
import type { Store, ZayConfig } from "../core/types";
import { isEmptyValue } from "../schema/dsl.mjs";

/**
 * Reading your content from your site's code: the other half of the panel. The panel writes
 * files; the reader gives you the same documents back, completed with the schema's defaults,
 * from a local folder (your own checkout) or straight from a GitHub repository.
 *
 *   const reader = createReader(config);                                   // local files
 *   const reader = createGitHubReader(config, { repo: "me/content", token }); // a repository
 *
 *   await reader.collections.posts.list();                    // ["hello", "second-post"]
 *   await reader.collections.posts.read("hello", { locale: "de" });
 *   await reader.singletons.home.read();
 */

export type Doc = Record<string, unknown>;

export type ReadOptions = {
  /** Language to read. Default: the default language. */
  locale?: string;
  /**
   * For other languages: fill what is not translated yet from the default language (default true),
   * so the result is always a complete document. `false` returns the translation's own fields only.
   */
  fallback?: boolean;
};

export type CollectionReader = {
  /** Addresses of the entries (those that have a default-language file). */
  list(): Promise<string[]>;
  /** Languages an entry has a file for. */
  locales(slug: string): Promise<string[]>;
  /** One entry as a document in the requested language, or null if there is no such entry. */
  read(slug: string, options?: ReadOptions): Promise<Doc | null>;
  /** Every language's document of an entry (empty documents for missing translations), or null. */
  docs(slug: string): Promise<Record<string, Doc> | null>;
  /** Every entry, in address order. */
  all(options?: ReadOptions): Promise<{ slug: string; entry: Doc }[]>;
};

export type SingletonReader = {
  read(options?: ReadOptions): Promise<Doc | null>;
  docs(): Promise<Record<string, Doc> | null>;
};

export type FileSetReader = {
  /** Names of the files in the set (for example "nav", "footer"). */
  files(): Promise<string[]>;
  read(file: string, options?: ReadOptions): Promise<Doc | null>;
  docs(file: string): Promise<Record<string, Doc> | null>;
};

export type Reader = {
  collections: Record<string, CollectionReader>;
  singletons: Record<string, SingletonReader>;
  fileSets: Record<string, FileSetReader>;
};

/* ── Translation overlay ────────────────────────────────────────── */

const isObject = (v: unknown): v is Doc => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * `over` (a translation) on top of `base` (the default language): translated values win,
 * empty ones fall back. Lists and blocks line up by position, so a translated item that only
 * carries some fields (a gallery's `alt`) is merged into the default item at the same index.
 */
export function overlay(base: unknown, over: unknown): unknown {
  if (Array.isArray(base) && Array.isArray(over)) return base.map((item, i) => (i < over.length ? overlay(item, over[i]) : item));
  if (isObject(base) && isObject(over)) {
    const out: Doc = { ...base };
    for (const [key, value] of Object.entries(over)) out[key] = key in base ? overlay(base[key], value) : value;
    return out;
  }
  return isEmptyValue(over) ? base : over;
}

function pick(docs: Record<string, Doc>, defaultLocale: string, { locale, fallback = true }: ReadOptions = {}): Doc {
  const base = docs[defaultLocale] ?? {};
  if (!locale || locale === defaultLocale) return base;
  const translated = docs[locale] ?? {};
  return fallback ? (overlay(base, translated) as Doc) : translated;
}

const missing = (error: unknown) => error instanceof HttpError && error.status === 404;

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/* ── Reader over any store ──────────────────────────────────────── */

function readerFor(input: ZayConfig, store: Store): Reader {
  const config = resolveConfig(input);
  const ctx: Ctx = { config, store };
  const def = config.defaultLocale;

  const collections = Object.fromEntries(
    Object.keys(config.collections).map((name): [string, CollectionReader] => {
      const docs = async (slug: string) => {
        try {
          return (await readEntry(ctx, name, slug)).docs as Record<string, Doc>;
        } catch (error) {
          if (missing(error)) return null;
          throw error;
        }
      };
      const reader: CollectionReader = {
        async list() {
          const slugs = await entrySlugs(ctx, name);
          return [...slugs.entries()].filter(([, locales]) => locales.includes(def)).map(([slug]) => slug).sort();
        },
        async locales(slug) {
          return (await entrySlugs(ctx, name)).get(slug) ?? [];
        },
        async docs(slug) {
          return docs(slug);
        },
        async read(slug, options) {
          const all = await docs(slug);
          return all ? pick(all, def, options) : null;
        },
        async all(options) {
          const slugs = await reader.list();
          const rows = await pool(slugs, 8, async (slug) => ({ slug, entry: await reader.read(slug, options) }));
          return rows.filter((r): r is { slug: string; entry: Doc } => r.entry !== null);
        },
      };
      return [name, reader];
    }),
  );

  const singletons = Object.fromEntries(
    Object.keys(config.singletons).map((name): [string, SingletonReader] => {
      const docs = async () => {
        const r = await readSingleton(ctx, name);
        return r.exists ? (r.docs as Record<string, Doc>) : null;
      };
      return [name, { docs, read: async (options) => { const d = await docs(); return d ? pick(d, def, options) : null; } }];
    }),
  );

  const fileSets = Object.fromEntries(
    Object.keys(config.fileSets).map((name): [string, FileSetReader] => {
      const docs = async (file: string) => {
        try {
          return (await readFileSet(ctx, name, file)).docs as Record<string, Doc>;
        } catch (error) {
          if (missing(error)) return null;
          throw error;
        }
      };
      return [
        name,
        {
          files: async () => (await listFileSetFiles(ctx, name)).map((f) => f.name),
          docs,
          read: async (file, options) => {
            const d = await docs(file);
            return d ? pick(d, def, options) : null;
          },
        },
      ];
    }),
  );

  return { collections, singletons, fileSets };
}

/** A reader over files on disk: your project's folder (default `config.root`, else the working directory), or a checkout of a content repository. */
export function createReader(config: ZayConfig, options: { root?: string } = {}): Reader {
  return readerFor(config, fsStore(options.root ?? config.root ?? process.cwd()));
}

/**
 * A reader over a GitHub repository, fetched through the GitHub API: the site does not need the content in
 * its own repository. `token` needs read access to the repository (a fine-grained token with "Contents: read").
 * `pathPrefix` is the content folder inside the repository, if it is not the root.
 */
export function createGitHubReader(
  config: ZayConfig,
  options: { repo: string | { owner: string; name: string }; ref?: string; token: string; pathPrefix?: string; apiUrl?: string },
): Reader {
  const repo = typeof options.repo === "string" ? { owner: options.repo.split("/")[0]!, name: options.repo.split("/")[1]! } : options.repo;
  if (!repo.owner || !repo.name) throw new Error('createGitHubReader: repo must be "owner/name"');
  const store = withPathPrefix(githubStore(options.token, { ...repo, branch: options.ref ?? "main" }, options.apiUrl), options.pathPrefix ?? config.repo?.pathPrefix);
  return readerFor(config, store);
}
