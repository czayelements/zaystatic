import type { Field, Fields } from "../schema/dsl.mjs";
import { isI18n, translatableOf } from "./translation";
import type { EditorSpec } from "./types";
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
      Object.entries(field.blocks).map(([k, b]) => [k, { ...b, label: pick(b.label, lang), ...(b.hint !== undefined ? { hint: pick(b.hint, lang) } : {}), ...(b.description !== undefined ? { description: pick(b.description, lang) } : {}), fields: localizeFields(b.fields, lang) }]),
    );
  }
  return f as unknown as Field;
}

export const localizeFields = (fields: Fields, lang: string): Fields =>
  Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, localizeField(f, lang)]));

type Labelled<T> = Omit<T, "label"> & { label: string };

/**
 * What the panel needs to know about translation: whether it is on, and which fields the
 * non-default language tabs show (`i18nFields`, already resolved to the panel language).
 */
export type ResolvedEditor = { name: string; label?: string; default: boolean; languages: "tabs" | "self" };

/** `editors` (or the old `editor: "name"` shorthand, which opens first) as a uniform, localized list. */
function resolveEditors(def: { editors?: (string | EditorSpec)[]; editor?: string }, lang: string): ResolvedEditor[] {
  const list: (string | EditorSpec)[] = def.editors ?? (def.editor ? [{ name: def.editor, default: true }] : []);
  return list.map((e) => {
    const spec: EditorSpec = typeof e === "string" ? { name: e, default: true } : e;
    return { name: spec.name, ...(spec.label !== undefined ? { label: pick(spec.label, lang) } : {}), default: spec.default === true, languages: spec.languages ?? "tabs" };
  });
}

function withI18n<T extends Collection | Singleton>(def: T, lang: string): Labelled<T> & { i18n: boolean; i18nFields?: Fields; editors: ResolvedEditor[] } {
  const on = isI18n(def);
  const { layout: _layout, editor: _editor, ...rest } = def as T & { layout?: unknown; editor?: unknown };
  void _layout;
  void _editor;
  return {
    ...rest,
    editors: resolveEditors(def, lang),
    label: pick(def.label, lang),
    fields: localizeFields(def.fields, lang),
    i18n: on,
    ...(on ? { i18nFields: localizeFields(translatableOf(def), lang) } : {}),
  } as unknown as Labelled<T> & { i18n: boolean; i18nFields?: Fields; editors: ResolvedEditor[] };
}

export function localizeSchema(config: ResolvedConfig, lang: string) {
  const mapObj = <T extends { label: Label }, R>(o: Record<string, T>, fn: (v: T) => R) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v)]));
  return {
    groups: config.groups.map((g) => ({ ...g, label: pick(g.label, lang) })),
    collections: mapObj(config.collections, (c: Collection) => withI18n(c, lang)),
    singletons: mapObj(config.singletons, (s: Singleton) => withI18n(s, lang)),
    fileSets: mapObj(config.fileSets, (f: FileSet) => ({ label: pick(f.label, lang), group: f.group })),
  };
}

export const localizeFile = (f: FileSetFile, lang: string): Omit<FileSetFile, "label"> & { label: string } => ({ ...f, label: pick(f.label, lang) });
void opt;
