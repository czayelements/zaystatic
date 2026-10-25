import { fieldsFromSample, isEmptyValue, normalize, obj, translatableFields } from "../schema/dsl.mjs";
import type { Field, Fields } from "../schema/dsl.mjs";
import { parseDoc, serializeDoc } from "./serialize";
import { HttpError } from "./types";
import type { Change, Collection, FileSet, FileSetFile, Store, ZayConfig } from "./types";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Ctx = { config: ZayConfig; store: Store };

export type EntrySummary = {
  slug: string;
  title: string;
  summary: string;
  /** Dosyası olan diller. */
  locales: string[];
  /** Panelde "yayında" bayrağı olan koleksiyonlarda; yoksa undefined. */
  published?: boolean;
};

type Row = EntrySummary & { _sort?: unknown };

export type EntryData = {
  slug: string;
  layout: "plain" | "locales";
  /** Dil → o dilin belgesi (şemaya göre tamamlanmış). */
  docs: Record<string, Record<string, unknown>>;
  /** Dosyası depoda olan diller. */
  existing: string[];
};

const collectionOf = (config: ZayConfig, name: string): Collection => {
  const c = Object.hasOwn(config.collections, name) ? config.collections[name] : undefined;
  if (!c) throw new HttpError(404, `koleksiyon yok: ${name}`);
  return c;
};

const bodyKeyOf = (fields: Fields) => Object.entries(fields).find(([, f]) => f.type === "markdown")?.[0] ?? "body";
const ext = (c: Collection) => (c.layout === "locales" ? (c.ext ?? "json") : "json");

/** `{{a.b}}` yer tutucularını belgeden doldurur. */
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

/**
 * Yalnız gerçekten değişen dosyaları commit eder; hiçbir şey değişmediyse
 * commit atılmaz (boş commit gereksiz bir yayın tetiklerdi).
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

/* ── Koleksiyonlar ──────────────────────────────────────────────── */

function slugsOf(config: ZayConfig, c: Collection, files: string[]) {
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

const fileName = (config: ZayConfig, c: Collection, slug: string, locale: string) =>
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
        /* Liste için gövdeyi okumuyoruz (büyük olabilir): yalnız üst alanlar. */
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
        return { slug, title: slug, summary: "⚠ dosya okunamadı", locales };
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
  if (!SLUG.test(slug)) throw new HttpError(400, "geçersiz adres");
  const files = await store.list(c.dir);
  const existing = slugsOf(config, c, files).get(slug) ?? [];
  if (!existing.includes(config.defaultLocale)) throw new HttpError(404, "kayıt yok");

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
  if (!SLUG.test(slug)) throw new HttpError(400, "Adres yalnız küçük harf, rakam ve tire içerebilir.");
  const def = config.defaultLocale;
  const files = await store.list(c.dir);
  const existing = slugsOf(config, c, files).get(slug) ?? [];
  if (opts.create && existing.length) throw new HttpError(409, "Bu adreste bir kayıt zaten var.");
  if (!opts.create && !existing.includes(def)) throw new HttpError(404, "kayıt yok");

  const bodyKey = bodyKeyOf(c.fields);
  const changes: Change[] = [];
  const locales = c.layout === "plain" ? [def] : config.locales;

  for (const locale of locales) {
    const fields = locale === def ? c.fields : translatableFields(c.fields);
    const doc = normalize(obj("", fields), docs[locale]) as Record<string, unknown>;
    const path = `${c.dir}/${fileName(config, c, slug, locale)}`;

    if (locale === def) {
      if (!String(doc[c.identifier] ?? "").trim()) {
        throw new HttpError(422, `"${c.fields[c.identifier]?.label ?? c.identifier}" boş olamaz.`);
      }
    } else if (isEmptyValue(doc)) {
      if (existing.includes(locale)) changes.push({ path, content: null });
      continue;
    }
    changes.push({ path, content: serializeDoc(doc, ext(c), bodyKey) });
  }

  const title = String((docs[def] as Record<string, unknown> | undefined)?.[c.identifier] ?? slug).slice(0, 60);
  return commitChanges(store, changes, `content(${name}): ${opts.create ? "add" : "update"} ${slug} — ${title}`);
}

export async function deleteEntry({ config, store }: Ctx, name: string, slug: string) {
  const c = collectionOf(config, name);
  if (!SLUG.test(slug)) throw new HttpError(400, "geçersiz adres");
  const files = await store.list(c.dir);
  const existing = slugsOf(config, c, files).get(slug) ?? [];
  if (!existing.length) throw new HttpError(404, "kayıt yok");
  const changes: Change[] = existing.map((locale) => ({ path: `${c.dir}/${fileName(config, c, slug, locale)}`, content: null }));
  return commitChanges(store, changes, `content(${name}): delete ${slug}`);
}

/** Relation alanları için: koleksiyonun adres + başlık listesi. */
export async function optionsOf(ctx: Ctx, name: string) {
  const rows = await listEntries(ctx, name);
  return rows.map((r) => ({ value: r.slug, label: r.title }));
}

/* ── Tek dosyalar ───────────────────────────────────────────────── */

const singletonOf = (config: ZayConfig, name: string) => {
  const s = config.singletons && Object.hasOwn(config.singletons, name) ? config.singletons[name] : undefined;
  if (!s) throw new HttpError(404, `kayıt yok: ${name}`);
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
  return commitChanges(store, [{ path: s.file, content: serializeDoc(data, "json", "body") }], `content(${name}): update`);
}

/* ── Dosya takımları (arayüz metinleri) ─────────────────────────── */

const fileSetOf = (config: ZayConfig, name: string): FileSet => {
  const f = config.fileSets && Object.hasOwn(config.fileSets, name) ? config.fileSets[name] : undefined;
  if (!f) throw new HttpError(404, `dosya takımı yok: ${name}`);
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
  if (!found) throw new HttpError(404, "dosya yok");
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
  if (!base) throw new HttpError(404, "varsayılan dil dosyası yok");
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
