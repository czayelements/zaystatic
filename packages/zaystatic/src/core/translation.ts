import { translatableFields } from "../schema/dsl.mjs";
import type { Fields } from "../schema/dsl.mjs";

/**
 * Content translation is a setting of each collection or singleton, not of its file layout:
 *
 *   i18n: true                                   // translate the text fields
 *   i18n: { enabled: true, fields: ["title", "body", "gallery.alt"] }
 *   i18n: false                                  // (default) one file, one language
 *
 * Enabled content is stored as one file per language (`slug.<locale>.<ext>`); the default
 * language's file carries every field, the others only the fields chosen here.
 */
export type I18nOption = boolean | { enabled?: boolean; fields?: string[] };

type Translatable = { i18n?: I18nOption; /** @deprecated use `i18n` */ layout?: "plain" | "locales"; fields: Fields };

const TEXTUAL = new Set(["string", "text", "markdown"]);

export function isI18n(def: Pick<Translatable, "i18n" | "layout">): boolean {
  if (def.i18n === undefined) return def.layout === "locales";
  return typeof def.i18n === "boolean" ? def.i18n : def.i18n.enabled !== false;
}

/**
 * The fields shown (and stored) in non-default languages. Order of precedence: the explicit
 * `i18n.fields` list, then fields marked `i18n: "translate"`, then every top-level text field.
 */
export function translatableOf(def: Translatable): Fields {
  const listed = typeof def.i18n === "object" ? def.i18n.fields : undefined;
  if (listed?.length) {
    for (const path of listed) {
      const head = path.split(".")[0]!;
      if (!(head in def.fields)) throw new Error(`i18n.fields: unknown field "${head}" (in "${path}")`);
    }
    return translatableFields(def.fields, listed);
  }
  const marked = translatableFields(def.fields);
  if (Object.keys(marked).length) return marked;
  return Object.fromEntries(Object.entries(def.fields).filter(([, f]) => TEXTUAL.has(f.type)));
}
