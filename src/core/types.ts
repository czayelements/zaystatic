import type { Fields } from "../schema/dsl.mjs";
import type { MediaConfig } from "./media";

/** A sidebar collection: the files in a folder are its entries. */
export type Collection = {
  label: string;
  /** Folder relative to the repository root, e.g. "content/blog". */
  dir: string;
  /**
   * "plain":   `<slug>.json` — one file, one entry.
   * "locales": `<slug>.<locale>.<ext>` — one file per language; the default
   *            language's file carries every field, the others only the
   *            fields marked `i18n: "translate"`.
   */
  layout: "plain" | "locales";
  /** "locales" only: file extension. "mdx" → YAML frontmatter + body. */
  ext?: "json" | "mdx";
  /** Field shown as the title in lists. */
  identifier: string;
  /** Second line of a list row, e.g. "{{title}} · {{publishedAt}}". */
  summary?: string;
  fields: Fields;
  /** List order; defaults to title A→Z. The field value may be text, a number or a date. */
  sort?: { field: string; order?: "asc" | "desc" };
  /** Sidebar group (ZayConfig.groups[].id). */
  group?: string;
  /** Name of a custom editor (registered in ZayApp `editors`); shown instead of / next to the form. */
  editor?: string;
};

/** Single-file content (settings, menus …). */
export type Singleton = {
  label: string;
  file: string;
  fields: Fields;
  group?: string;
};

export type FileSetFile = { name: string; label: string; path: string };

/**
 * Files with the same shape in every language (UI strings, for example). The
 * schema is not written by hand: it is derived from the default language's file.
 * Path templates use `{locale}` (and `{name}` with `scan`).
 */
export type FileSet = {
  label: string;
  group?: string;
  files?: FileSetFile[];
  /** Every `.json` in the folder counts as a file. The `dir` and `path` templates contain `{locale}`. */
  scan?: { dir: string; path: string; labels?: Record<string, string> };
};

/** The content model: which kinds of content exist and their fields. Can live in a file of its own, apart from the settings (ZayConfig). */
export type ZaySchema = {
  /** Sidebar groups (they appear in the order given here). */
  groups?: { id: string; label: string }[];
  collections?: Record<string, Collection>;
  singletons?: Record<string, Singleton>;
  fileSets?: Record<string, FileSet>;
};

/**
 * Panel settings. The content model is given under `schema` (or directly as
 * `collections`, `singletons`, `fileSets`, `groups`); the two are merged.
 */
export type ZayConfig = ZaySchema & {
  /** Title of the panel. */
  name?: string;
  locales: string[];
  defaultLocale: string;
  localeNames?: Record<string, string>;
  /** Path of the panel page (the Next.js page lives here). */
  basePath: string;
  /** Path of the API (the Next.js route handler lives here). */
  apiPath: string;
  /** In production, content is committed to this GitHub repository. */
  repo?: { owner: string; name: string; branch?: string };
  /** Content model (zay.schema.ts). */
  schema?: ZaySchema;
  /** Image uploads (optional): s3Media(...), repoMedia() or your own MediaAdapter. */
  media?: MediaConfig;
  /** Language of the panel UI (default "en"; bundled: "en", "tr"). */
  language?: string;
  /**
   * Your own panel strings, keyed by language code. Add a language the package
   * does not ship yet, or reword any string; missing keys fall back to English.
   * Keys are those of `src/ui/locales/en.ts`.
   */
  translations?: Record<string, Record<string, string>>;
  /** Local file root (default: process.cwd()). */
  root?: string;
};

/** `schema` merged with the top-level definitions; the engine reads only this. */
export type ResolvedConfig = Omit<ZayConfig, keyof ZaySchema | "schema"> & {
  groups: NonNullable<ZaySchema["groups"]>;
  collections: Record<string, Collection>;
  singletons: Record<string, Singleton>;
  fileSets: Record<string, FileSet>;
};

export function resolveConfig(config: ZayConfig): ResolvedConfig {
  const { schema, groups, collections, singletons, fileSets, ...settings } = config;
  return {
    ...settings,
    groups: groups ?? schema?.groups ?? [],
    collections: { ...schema?.collections, ...collections },
    singletons: { ...schema?.singletons, ...singletons },
    fileSets: { ...schema?.fileSets, ...fileSets },
  };
}

/* Definition helpers: for type checking and completion; identity functions at runtime. */
export const defineConfig = <T extends ZayConfig>(config: T): T => config;
export const defineSchema = <T extends ZaySchema>(schema: T): T => schema;
export const defineCollection = (c: Collection): Collection => c;
export const defineSingleton = (s: Singleton): Singleton => s;
export const defineFileSet = (f: FileSet): FileSet => f;

export type Change = {
  path: string;
  /** null → delete the file. */
  content: string | null;
  encoding?: "utf-8" | "base64";
};

export interface Store {
  readonly kind: "fs" | "github";
  /** File names in the folder (subfolders excluded); empty if the folder does not exist. */
  list(dir: string): Promise<string[]>;
  /** Every file under `dir`, recursively, as full repository paths (empty if the folder does not exist). */
  listTree(dir: string): Promise<string[]>;
  read(path: string): Promise<string | null>;
  /** All changes in one commit (GitHub) / written in order (local). */
  commit(changes: Change[], message: string): Promise<{ id?: string; url?: string }>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Validation issues (status 422), keyed by language so the panel can mark the right tab. */
    public issues?: { locale: string; path: (string | number)[]; code: string; params?: Record<string, unknown> }[],
  ) {
    super(message);
  }
}
