import type { Field, Fields } from "../schema/dsl.mjs";
import type { Collection, FileSet, FileSetFile, ResolvedConfig, Singleton } from "./types";

/**
 * Panel language handling on the server. Labels in the schema (collection names,
 * field labels, hints, option labels, block names, group names, pattern messages)
 * may be a plain string or a map of language -> text:
 *
 *   str({ en: "Title", de: "Titel" })
 *
 * The panel asks for its schema in the language the user picked (`?lang=de`) and the
 * server resolves every label to a string, so the UI never sees the maps.
 */

export type Label = string | Record<string, string>;

/**
 * Picks the text for `lang`: exact match, then the base language ("pt" for "pt-BR"),
 * then English, then the first entry. A plain string is returned as is.
 */
export function pickLabel(label: Label | undefined, lang: string): string {
  if (label == null) return "";
  if (typeof label === "string") return label;
  const base = lang.split("-")[0]!;
  return label[lang] ?? label[base] ?? label.en ?? Object.values(label)[0] ?? "";
}

const pick = (l: unknown, lang: string) => pickLabel(l as Label | undefined, lang);
const opt = (l: unknown, lang: string) => (l === undefined ? undefined : pick(l, lang));

export function localizeField(field: Field, lang: string): Field {
  const f: Record<string, unknown> = { ...field, label: pick(field.label, lang) };
  if (field.hint !== undefined) f.hint = pick(field.hint, lang);
  if (field.patternMessage !== undefined) f.patternMessage = pick(field.patternMessage, lang);
  if (Array.isArray(field.pattern)) f.pattern = [field.pattern[0], pick(field.pattern[1], lang)];
  if (field.options) f.options = field.options.map((o) => ({ ...o, label: pick(o.label, lang) }));
  if (field.fields) f.fields = localizeFields(field.fields, lang);
  if (field.item) f.item = localizeField(field.item, lang);
  if (field.blocks) {
    f.blocks = Object.fromEntries(
      Object.entries(field.blocks).map(([k, b]) => [k, { ...b, label: pick(b.label, lang), ...(b.hint !== undefined ? { hint: pick(b.hint, lang) } : {}), fields: localizeFields(b.fields, lang) }]),
    );
  }
  return f as unknown as Field;
}

export const localizeFields = (fields: Fields, lang: string): Fields =>
  Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, localizeField(f, lang)]));

type Labelled<T> = Omit<T, "label"> & { label: string };

export function localizeSchema(config: ResolvedConfig, lang: string) {
  const mapObj = <T extends { label: Label }, R>(o: Record<string, T>, fn: (v: T) => R) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v)]));
  return {
    groups: config.groups.map((g) => ({ ...g, label: pick(g.label, lang) })),
    collections: mapObj(config.collections, (c: Collection): Labelled<Collection> => ({ ...c, label: pick(c.label, lang), fields: localizeFields(c.fields, lang) })),
    singletons: mapObj(config.singletons, (s: Singleton): Labelled<Singleton> => ({ ...s, label: pick(s.label, lang), fields: localizeFields(s.fields, lang) })),
    fileSets: mapObj(config.fileSets, (f: FileSet) => ({ label: pick(f.label, lang), group: f.group })),
  };
}

export const localizeFile = (f: FileSetFile, lang: string): Omit<FileSetFile, "label"> & { label: string } => ({ ...f, label: pick(f.label, lang) });
void opt;
