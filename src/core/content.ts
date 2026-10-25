import { fieldsFromSample, isEmptyValue, normalize, obj, translatableFields, validateDoc } from "../schema/dsl.mjs";
import type { Field, Fields } from "../schema/dsl.mjs";
import { parseDoc, serializeDoc } from "./serialize";
import { HttpError } from "./types";
import type { Change, Collection, FileSet, FileSetFile, ResolvedConfig, Store } from "./types";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Ctx = { config: ResolvedConfig; store: Store };

export type EntrySummary = {
  slug: string;
  title: string;
  summary: string;
  /** Languages that have a file. */
  locales: string[];
  /** For collections with a "published" flag; undefined otherwise. */
  published?: boolean;
};

type Row = EntrySummary & { _sort?: unknown };

export type EntryData = {
  slug: string;
  layout: "plain" | "locales";
  /** Language → that language's document (completed from the schema). */
  docs: Record<string, Record<string, unknown>>;
  /** Languages whose file exists in the store. */
  existing: string[];
};

const collectionOf = (config: ResolvedConfig, name: string): Collection => {
  const c = Object.hasOwn(config.collections, name) ? config.collections[name] : undefined;
  if (!c) throw new HttpError(404, `unknown collection: ${name}`);
  return c;
};

const bodyKeyOf = (fields: Fields) => Object.entries(fields).find(([, f]) => f.type === "markdown")?.[0] ?? "body";
const ext = (c: Collection) => (c.layout === "locales" ? (c.ext ?? "json") : "json");

/** Fills `{{a.b}}` placeholders from the document. */
export function renderTemplate(tpl: string, data: unknown): string {
  return tpl
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
      let v: unknown = data;
      for (const key of path.replace(/^fields\./, "").split(".")) v = (v as Record<string, unknown> | null)?.[key];
      return v == null ? "" : String(v);
    })
    .replace(/^[\s·]+|[\s·]+$/g, "")
    .replace(/\s*·\s*·\s*/g, " · ");
}

type ValidationIssue = NonNullable<HttpError["issues"]>[number];

/** Validates one language document; `required` applies to the default language only. */
function issuesOf(fields: Fields, doc: unknown, locale: string, isDefault: boolean): ValidationIssue[] {
  return validateDoc(fields, doc, { checkRequired: isDefault }).map((i) => ({ ...i, locale }));
}

function failValidation(issues: ValidationIssue[]): never {
  const parts = issues.slice(0, 5).map((i) => `${i.locale}:${i.path.join(".")} (${i.code})`);
  const more = issues.length > 5 ? ` and ${issues.length - 5} more` : "";
  throw new HttpError(422, `Validation failed: ${parts.join(", ")}${more}`, issues);
}

/**
 * Commits only the files that really changed; if nothing changed, no commit
 * is made (an empty commit would trigger a pointless deploy).
 */
async function commitChanges(store: Store, changes: Change[], message: string) {
  const real: Change[] = [];
  for (const change of changes) {
    const current = change.encoding === "base64" ? undefined : await store.read(change.path);
    if (change.content === null ? current == null : current === change.content) continue;
    real.push(change);
  }
  if (!real.length) return { unchanged: true as const, files: 0 };
  const res = await store.commit(real, message);
  return { ...res, files: real.length };
}

/* ── Collections ────────────────────────────────────────────────── */

function slugsOf(config: ResolvedConfig, c: Collection, files: string[]) {
  const e = ext(c);
  if (c.layout === "plain") {
    return new Map<string, string[]>(
      files.filter((f) => f.endsWith(".json")).map((f): [string, string[]] => [f.slice(0, -5), [config.defaultLocale]]),
    );
  }
  const re = new RegExp(`^(.+)\\.(${config.locales.map(escapeRe).join("|")})\\.${e}$`);
  const map = new Map<string, string[]>();
  for (const f of files) {
    const m = re.exec(f);
    if (!m) continue;
    map.set(m[1]!, [...(map.get(m[1]!) ?? []), m[2]!]);
  }
  return map;
}

const fileName = (config: ResolvedConfig, c: Collection, slug: string, locale: string) =>
  c.layout === "plain" ? `${slug}.json` : `${slug}.${locale}.${ext(c)}`;

export async function listEntries({ config, store }: Ctx, name: string): Promise<EntrySummary[]> {
  const c = collectionOf(config, name);
  const files = await store.list(c.dir);
  const slugs = slugsOf(config, c, files);
  const full = obj("", c.fields);
  const bodyKey = bodyKeyOf(c.fields);

  const rows = await Promise.all(
    [...slugs.entries()].map(async ([slug, locales]): Promise<Row | null> => {
      if (!locales.includes(config.defaultLocale)) return null;
      const path = `${c.dir}/${fileName(config, c, slug, config.defaultLocale)}`;
      const text = await store.read(path);
      if (text == null) return null;
      try {
        /* Lists do not need the body (it can be large), only the top-level fields. */
        const doc = normalize(full, parseDoc(text, ext(c), bodyKey, path)) as Record<string, unknown>;
        const flag = doc.isPublished ?? doc.published;
        return {
          slug,
          title: String(doc[c.identifier] ?? "").trim() || slug,
          summary: c.summary ? renderTemplate(c.summary, doc) : "",
          locales,
          ...(typeof flag === "boolean" ? { published: flag } : {}),
          ...(c.sort ? { _sort: doc[c.sort.field] } : {}),
        };
      } catch {
        return { slug, title: slug, summary: "⚠ file could not be read", locales };
      }
    }),
  );
  const present = rows.filter((r): r is Row => r !== null);
  const byTitle = (a: Row, b: Row) => a.title.localeCompare(b.title, config.defaultLocale);
  if (c.sort) {
    const dir = c.sort.order === "desc" ? -1 : 1;
    present.sort((a, b) => {
      const x = a._sort;
      const y = b._sort;
      if (x == null || x === "") return y == null || y === "" ? byTitle(a, b) : 1;
      if (y == null || y === "") return -1;
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return cmp ? cmp * dir : byTitle(a, b);
    });
  } else present.sort(byTitle);
  return present.map((r) => {
    const row: Row = { ...r };
    delete row._sort;
    return row;
  });
}

export async function readEntry({ config, store }: Ctx, name: string, slug: string): Promise<EntryData> {
  const c = collectionOf(config, name);
  if (!SLUG.test(slug)) throw new HttpError(400, "invalid address");
  const files = await store.list(c.dir);
  const existing = slugsOf(config, c, files).get(slug) ?? [];
  if (!existing.includes(config.defaultLocale)) throw new HttpError(404, "entry not found");

  const bodyKey = bodyKeyOf(c.fields);
  const docs: EntryData["docs"] = {};
  const locales = c.layout === "plain" ? [config.defaultLocale] : config.locales;
  for (const locale of locales) {
    const fields = locale === config.defaultLocale ? c.fields : translatableFields(c.fields);
    let raw: Record<string, unknown> = {};
    if (existing.includes(locale)) {
      const path = `${c.dir}/${fileName(config, c, slug, locale)}`;
      const text = await store.read(path);
      if (text != null) raw = parseDoc(text, ext(c), bodyKey, path);
    }
    docs[locale] = normalize(obj("", fields), raw);
  }
  return { slug, layout: c.layout, docs, existing };
}

export async function writeEntry(
  { config, store }: Ctx,
  name: string,
  slug: string,
  docs: Record<string, unknown>,
  opts: { create: boolean },
) {
  const c = collectionOf(config, name);
  if (!SLUG.test(slug)) throw new HttpError(400, "The address may only contain lowercase letters, numbers and dashes.");
  const def = config.defaultLocale;
  const files = await store.list(c.dir);
  const existing = slugsOf(config, c, files).get(slug) ?? [];
  if (opts.create && existing.length) throw new HttpError(409, "An entry with this address already exists.");
  if (!opts.create && !existing.includes(def)) throw new HttpError(404, "entry not found");

  const bodyKey = bodyKeyOf(c.fields);
  const changes: Change[] = [];
  const locales = c.layout === "plain" ? [def] : config.locales;
  const issues: ValidationIssue[] = [];

  for (const locale of locales) {
    const fields = locale === def ? c.fields : translatableFields(c.fields);
    const doc = normalize(obj("", fields), docs[locale]) as Record<string, unknown>;
    const path = `${c.dir}/${fileName(config, c, slug, locale)}`;

    if (locale === def) {
      /* The identifier names the entry, so it is always required, whatever the schema says. */
      if (!String(doc[c.identifier] ?? "").trim()) issues.push({ locale, path: [c.identifier], code: "required" });
    } else if (isEmptyValue(doc)) {
      if (existing.includes(locale)) changes.push({ path, content: null });
      continue;
    }
    for (const issue of issuesOf(fields, doc, locale, locale === def)) {
      const dup = issues.some((x) => x.locale === issue.locale && x.code === issue.code && x.path.join(".") === issue.path.join("."));
      if (!dup) issues.push(issue);
    }
    changes.push({ path, content: serializeDoc(doc, ext(c), bodyKey) });
  }
  if (issues.length) failValidation(issues);

  const title = String((docs[def] as Record<string, unknown> | undefined)?.[c.identifier] ?? slug).slice(0, 60);
  return commitChanges(store, changes, `content(${name}): ${opts.create ? "add" : "update"} ${slug} — ${title}`);
}

export async function deleteEntry({ config, store }: Ctx, name: string, slug: string) {
  const c = collectionOf(config, name);
  if (!SLUG.test(slug)) throw new HttpError(400, "invalid address");
  const files = await store.list(c.dir);
  const existing = slugsOf(config, c, files).get(slug) ?? [];
  if (!existing.length) throw new HttpError(404, "entry not found");
  const changes: Change[] = existing.map((locale) => ({ path: `${c.dir}/${fileName(config, c, slug, locale)}`, content: null }));
  return commitChanges(store, changes, `content(${name}): delete ${slug}`);
}

/** For relation fields: the collection's addresses + titles. */
export async function optionsOf(ctx: Ctx, name: string) {
  const rows = await listEntries(ctx, name);
  return rows.map((r) => ({ value: r.slug, label: r.title }));
}

/* ── Singletons ─────────────────────────────────────────────────── */

const singletonOf = (config: ResolvedConfig, name: string) => {
  const s = Object.hasOwn(config.singletons, name) ? config.singletons[name] : undefined;
  if (!s) throw new HttpError(404, `unknown singleton: ${name}`);
  return s;
};

export async function readSingleton({ config, store }: Ctx, name: string) {
  const s = singletonOf(config, name);
  const text = await store.read(s.file);
  const raw = text == null ? {} : parseDoc(text, "json", "body", s.file);
  return { doc: normalize(obj("", s.fields), raw) as Record<string, unknown>, exists: text != null };
}

export async function writeSingleton({ config, store }: Ctx, name: string, doc: unknown) {
  const s = singletonOf(config, name);
  const data = normalize(obj("", s.fields), doc) as Record<string, unknown>;
  const issues = issuesOf(s.fields, data, config.defaultLocale, true);
  if (issues.length) failValidation(issues);
  return commitChanges(store, [{ path: s.file, content: serializeDoc(data, "json", "body") }], `content(${name}): update`);
}

/* ── File sets (UI strings) ─────────────────────────────────────── */

const fileSetOf = (config: ResolvedConfig, name: string): FileSet => {
  const f = Object.hasOwn(config.fileSets, name) ? config.fileSets[name] : undefined;
  if (!f) throw new HttpError(404, `unknown file set: ${name}`);
  return f;
};
const at = (tpl: string, locale: string, name?: string) =>
  tpl.replace(/\{locale\}/g, locale).replace(/\{name\}/g, name ?? "");

export async function listFileSetFiles({ config, store }: Ctx, name: string): Promise<FileSetFile[]> {
  const set = fileSetOf(config, name);
  const out: FileSetFile[] = [...(set.files ?? [])];
  if (set.scan) {
    const names = (await store.list(at(set.scan.dir, config.defaultLocale)))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .sort();
    for (const n of names) out.push({ name: n, label: set.scan.labels?.[n] ?? n, path: at(set.scan.path, "{locale}", n) });
  }
  return out;
}

async function fileSetFile(ctx: Ctx, name: string, file: string) {
  const found = (await listFileSetFiles(ctx, name)).find((f) => f.name === file);
  if (!found) throw new HttpError(404, "file not found");
  return found;
}

export async function readFileSet(ctx: Ctx, name: string, file: string) {
  const { config, store } = ctx;
  const f = await fileSetFile(ctx, name, file);
  const read = async (locale: string) => {
    const path = at(f.path, locale);
    const text = await store.read(path);
    return text == null ? null : (parseDoc(text, "json", "body", path) as Record<string, unknown>);
  };
  const base = await read(config.defaultLocale);
  if (!base) throw new HttpError(404, "default-language file not found");
  const fields: Fields = fieldsFromSample(base);
  const docs: Record<string, Record<string, unknown>> = {};
  for (const locale of config.locales) {
    docs[locale] = normalize(obj("", fields), locale === config.defaultLocale ? base : ((await read(locale)) ?? {}));
  }
  return { file: f, fields, docs };
}

export async function writeFileSet(ctx: Ctx, name: string, file: string, docs: Record<string, unknown>) {
  const { config, store } = ctx;
  const f = await fileSetFile(ctx, name, file);
  const { fields } = await readFileSet(ctx, name, file);
  const changes: Change[] = config.locales
    .filter((locale) => docs[locale] !== undefined)
    .map((locale) => ({
      path: at(f.path, locale),
      content: serializeDoc(normalize(obj("", fields), docs[locale]) as Record<string, unknown>, "json", "body"),
    }));
  return commitChanges(store, changes, `content(${name}): update ${f.name}`);
}

export type { Field };
