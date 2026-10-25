/**
 * zay-static field definition language.
 *
 * One source of truth: the same definition drives both the reader that builds
 * your site (`normalize`, which fills in defaults) and the panel's forms. If
 * they were written separately, what the panel writes and what the site reads
 * would drift apart over time. This file is plain `.mjs` so that Node scripts
 * (your build) and TypeScript (the panel) import the very same code.
 *
 * `normalize`: a missing field gets the schema default, empty text is `""`,
 * an empty list is `[]`, a missing object becomes an object filled with its
 * sub-fields' defaults. Even if the file only holds the filled-in fields,
 * the code reading it always sees the same shape.
 *
 * The `i18n` marker (meaningful only in per-locale collections):
 *   "translate" -> the field lives in every language file with its own value
 *   (unmarked)  -> only in the default language's file
 */

const base = (type, label, o = {}) => ({ type, label, ...o });

/** Single-line text. */
export const str = (label, o = {}) => base("string", label, { default: "", ...o });
/** Multi-line text. */
export const text = (label, o = {}) => base("text", label, { default: "", ...o });
/** Image address: upload or paste a link in the panel; plain text in the file (URL or path). */
export const image = (label, o = {}) => base("image", label, { default: "", ...o });
/** Markdown/MDX source text (lossless: raw mode only in the panel). */
export const markdown = (label, o = {}) => base("markdown", label, { default: "", ...o });
export const int = (label, o = {}) => base("int", label, { default: null, ...o });
export const bool = (label, def = false, o = {}) => base("bool", label, { default: def, ...o });
export const select = (label, options, def = options[0]?.value ?? "", o = {}) =>
  base("select", label, { options, default: def, ...o });
/** YYYY-MM-DD */
export const date = (label, o = {}) => base("date", label, { default: null, ...o });
/** YYYY-MM-DDTHH:mm (treated as UTC) */
export const datetime = (label, o = {}) => base("datetime", label, { default: null, ...o });
/** Address (file name) of an entry in another collection. */
export const relation = (label, collection, o = {}) =>
  base("relation", label, { collection, default: null, ...o });
export const relations = (label, collection, o = {}) =>
  base("relations", label, { collection, default: [], ...o });
export const list = (label, item, o = {}) => base("list", label, { item, ...o });
export const obj = (label, fields, o = {}) => base("object", label, { fields, ...o });
/**
 * Blocks: a drag-and-drop sortable list of TYPED items (a page builder).
 * Each item is stored as `{ _type, ...fields }`; `_type` is the block's name.
 *
 *   blocks("Sections", {
 *     hero: block("Hero", { title: str("Title"), image: image("Image") }),
 *     text: block("Text", { body: markdown("Text") }),
 *   })
 */
export const block = (label, fields, o = {}) => ({ label, fields, ...o });
export const blocks = (label, types, o = {}) => base("blocks", label, { blocks: types, ...o });
export const strList = (label, itemLabel = "Madde", o = {}) =>
  list(label, str(itemLabel), o);

/* ── Reader: fill in defaults according to the schema ───────────── */

export function normalize(desc, raw) {
  switch (desc.type) {
    case "string":
    case "text":
    case "markdown":
    case "image":
      return typeof raw === "string" ? raw : raw == null ? desc.default : String(raw);
    case "int":
      return typeof raw === "number" ? raw : desc.default;
    case "bool":
      return typeof raw === "boolean" ? raw : desc.default;
    case "select":
      return typeof raw === "string" ? raw : desc.default;
    case "date":
    case "datetime":
      if (raw instanceof Date) return raw.toISOString();
      return typeof raw === "string" && raw !== "" ? raw : desc.default;
    case "relation":
      return typeof raw === "string" && raw !== "" ? raw : desc.default;
    case "relations":
      return Array.isArray(raw) ? raw.filter((v) => typeof v === "string") : [];
    case "list":
      return Array.isArray(raw) ? raw.map((item) => normalize(desc.item, item)) : [];
    case "blocks":
      return Array.isArray(raw)
        ? raw
            .filter((item) => item && typeof item === "object" && Object.hasOwn(desc.blocks, item._type))
            .map((item) => ({ _type: item._type, ...normalize(obj("", desc.blocks[item._type].fields), item) }))
        : [];
    case "object": {
      const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
      return Object.fromEntries(
        Object.entries(desc.fields).map(([key, field]) => [key, normalize(field, src[key])]),
      );
    }
    default:
      throw new Error(`unknown field type: ${desc.type}`);
  }
}

/** A record made of the defaults of every field in the schema. */
export const defaults = (fields) => normalize(obj("", fields), {});

/* ── Locale file schema: translatable fields only ───────────────── */

/**
 * The sub-schema of fields marked `i18n: "translate"`. In lists and objects
 * only the translatable sub-fields remain (e.g. gallery → only `alt`).
 */
export function translatableFields(fields) {
  const out = {};
  for (const [key, f] of Object.entries(fields)) {
    if (f.i18n !== "translate") continue;
    if (f.type === "object") out[key] = { ...f, fields: translatableFields(f.fields) };
    else if (f.type === "blocks")
      out[key] = {
        ...f,
        blocks: Object.fromEntries(Object.entries(f.blocks).map(([name, b]) => [name, { ...b, fields: translatableFields(b.fields) }])),
      };
    else if (f.type === "list" && f.item.type === "object")
      out[key] = { ...f, item: { ...f.item, fields: translatableFields(f.item.fields) } };
    else out[key] = f;
  }
  return out;
}

/* ── Schema from a sample ───────────────────────────────────────── */

/**
 * Derives a field schema from the shape of a JSON value (for files such as UI
 * strings whose schema is not written by hand). Text → string/text, array →
 * list, object → object. Every field is marked translatable and optional.
 */
export function fieldsFromSample(sample, { longText = (v) => v.includes("\n") || v.length > 110 } = {}) {
  const field = (key, v) => {
    const o = { i18n: "translate", label: key, hint: undefined };
    if (typeof v === "string") return base(longText(v) ? "text" : "string", key, { default: "", i18n: "translate" });
    if (typeof v === "number") return base("int", key, { default: null, i18n: "translate" });
    if (typeof v === "boolean") return base("bool", key, { default: false, i18n: "translate" });
    if (Array.isArray(v)) {
      const first = v.find((x) => x != null);
      const item =
        first && typeof first === "object" && !Array.isArray(first)
          ? obj("", fieldsFromSample(first, { longText }), { i18n: "translate" })
          : str("#", { i18n: "translate" });
      return base("list", key, { item, ...o });
    }
    if (v && typeof v === "object") return base("object", key, { fields: fieldsFromSample(v, { longText }), ...o });
    return base("string", key, { default: "", i18n: "translate" });
  };
  return Object.fromEntries(Object.entries(sample ?? {}).map(([k, v]) => [k, field(k, v)]));
}

/** Is the value "empty"? (empty text, list/object made only of empty values, false, no number) */
export function isEmptyValue(v) {
  if (v == null || v === "" || v === false) return true;
  if (Array.isArray(v)) return v.every(isEmptyValue);
  /* `_type` carries the block type; on its own it is not content. */
  if (typeof v === "object") return Object.entries(v).every(([k, x]) => k === "_type" || isEmptyValue(x));
  return false;
}

/* ── Validation ─────────────────────────────────────────────────── */

const TEXTY = new Set(["string", "text", "markdown", "image", "select"]);

/**
 * Declarative rules on a field: `required`, `minLength`, `maxLength`, `pattern`
 * (+ `patternMessage`), `min`/`max` (numbers), `minItems`/`maxItems` (lists,
 * blocks, relations). Returns a list of issues `{ path, code, params? }`; the
 * panel turns the codes into (translated) messages, the server rejects the save.
 *
 * `checkRequired: false` skips `required` (used for non-default languages: a
 * translation may be partial, but whatever is filled in must still be valid).
 */
export function validateDoc(fields, doc, { checkRequired = true } = {}) {
  const out = [];
  const walk = (field, value, path) => {
    const push = (code, params) => out.push({ path, code, ...(params ? { params } : {}) });
    const empty = (v) => v == null || (typeof v === "string" && v.trim() === "");
    switch (field.type) {
      case "int": {
        if (empty(value)) return void (checkRequired && field.required && push("required"));
        if (field.min != null && value < field.min) push("min", { min: field.min });
        if (field.max != null && value > field.max) push("max", { max: field.max });
        return;
      }
      case "date":
      case "datetime":
      case "relation":
        return void (empty(value) && checkRequired && field.required && push("required"));
      case "relations":
      case "list":
      case "blocks": {
        const items = Array.isArray(value) ? value : [];
        if (checkRequired && field.required && items.length === 0) push("required");
        if (field.minItems != null && items.length < field.minItems && (items.length > 0 || checkRequired))
          push("minItems", { min: field.minItems });
        if (field.maxItems != null && items.length > field.maxItems) push("maxItems", { max: field.maxItems });
        if (field.type === "list") items.forEach((item, i) => walk(field.item, item, [...path, i]));
        if (field.type === "blocks") {
          items.forEach((item, i) => {
            const b = item && field.blocks[item._type];
            if (b) for (const [k, f] of Object.entries(b.fields)) walk(f, item[k], [...path, i, k]);
          });
        }
        return;
      }
      case "object": {
        const src = value && typeof value === "object" ? value : {};
        for (const [k, f] of Object.entries(field.fields)) walk(f, src[k], [...path, k]);
        return;
      }
      default: {
        if (!TEXTY.has(field.type)) return;
        const v = typeof value === "string" ? value : "";
        if (empty(v)) return void (checkRequired && field.required && push("required"));
        if (field.minLength != null && v.length < field.minLength) push("minLength", { min: field.minLength });
        if (field.maxLength != null && v.length > field.maxLength) push("maxLength", { max: field.maxLength });
        if (field.pattern) {
          let ok = true;
          try {
            ok = new RegExp(field.pattern).test(v);
          } catch {
            /* an invalid pattern in the schema must not block editors */
          }
          if (!ok) push("pattern", field.patternMessage ? { message: field.patternMessage } : undefined);
        }
      }
    }
  };
  for (const [k, f] of Object.entries(fields)) walk(f, doc?.[k], [k]);
  return out;
}
