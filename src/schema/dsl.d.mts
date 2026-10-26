export type FieldType =
  | "string" | "text" | "markdown" | "image" | "int" | "bool" | "select"
  | "date" | "datetime" | "relation" | "relations" | "list" | "object" | "blocks";

/** Text that may be given per language: `"Title"` or `{ en: "Title", de: "Titel" }`. */
export type Label = string | Record<string, string>;

/** As the panel receives it (resolved to a single language). */
export interface SelectOption { label: string; value: string }

export interface BlockType {
  label: string;
  hint?: string;
  fields: Fields;
  /** Template for the collapsed row title, e.g. "{{title}}". */
  summary?: string;
  /** Shown on the block's card in the visual builder's palette. */
  description?: string;
  /** A short glyph for the palette card (an emoji or a letter). */
  icon?: string;
}

export interface Field {
  type: FieldType;
  label: string;
  hint?: string;
  default?: unknown;
  /** "translate": the field lives in every language file with its own value. */
  i18n?: "translate";
  /** For list/object: panel summary template, e.g. "{{fields.title.tr}}". */
  summary?: string;
  /** object: sub-fields are shown side by side in one row (e.g. {tr,en,es,de}). */
  inline?: boolean;
  /** Validation: the value must be filled in (lists/blocks: at least one item). */
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  /** Regular expression source the value must match; add `patternMessage` to explain it. */
  pattern?: string | [source: string, message: string];
  /** Render this field with a custom widget: the name of a component in `<ZayApp widgets={...} />`. */
  widget?: string;
  patternMessage?: string;
  min?: number | null;
  max?: number | null;
  minItems?: number;
  maxItems?: number;
  options?: SelectOption[];
  collection?: string;
  item?: Field;
  fields?: Record<string, Field>;
  /** blocks: type name → block definition. */
  blocks?: Record<string, BlockType>;
}

export type Fields = Record<string, Field>;
/**
 * Options accepted by the field helpers. Texts (`hint`, `patternMessage`, the message in a
 * `pattern` tuple) may be given per language; the panel receives them already resolved.
 */
type Opts = Omit<Partial<Field>, "hint" | "patternMessage" | "pattern"> & {
  hint?: Label;
  patternMessage?: Label;
  pattern?: string | [source: string, message: Label];
} & Record<string, unknown>;

export function str(label: Label, o?: Opts): Field;
export function text(label: Label, o?: Opts): Field;
export function image(label: Label, o?: Opts): Field;
export function markdown(label: Label, o?: Opts): Field;
export function int(label: Label, o?: Opts): Field;
export function bool(label: Label, def?: boolean, o?: Opts): Field;
export function select(label: Label, options: { label: Label; value: string }[], def?: string, o?: Opts): Field;
export function date(label: Label, o?: Opts): Field;
export function datetime(label: Label, o?: Opts): Field;
export function relation(label: Label, collection: string, o?: Opts): Field;
export function relations(label: Label, collection: string, o?: Opts): Field;
export function list(label: Label, item: Field, o?: Opts): Field;
export function obj(label: Label, fields: Fields, o?: Opts): Field;
export function block(label: Label, fields: Fields, o?: Partial<BlockType>): BlockType;
export function blocks(label: Label, types: Record<string, BlockType>, o?: Opts): Field;
export function strList(label: Label, itemLabel?: string, o?: Opts): Field;

/* eslint-disable @typescript-eslint/no-explicit-any -- normalize() returns the shape the schema describes */
export function normalize(desc: Field, raw: unknown): any;
export function defaults(fields: Fields): any;
/* eslint-enable @typescript-eslint/no-explicit-any */
/** Fields to translate: `paths` (the collection's `i18n.fields`, dotted into nested fields) or, without it, the `i18n: "translate"` markers. */
export function translatableFields(fields: Fields, paths?: string[]): Fields;
export function fieldsFromSample(sample: unknown, opts?: { longText?: (v: string) => boolean }): Fields;
export function isEmptyValue(v: unknown): boolean;

export type IssueCode = "required" | "minLength" | "maxLength" | "pattern" | "min" | "max" | "minItems" | "maxItems";
export interface Issue {
  path: (string | number)[];
  code: IssueCode;
  params?: { min?: number; max?: number; message?: string };
}
export function validateDoc(fields: Fields, doc: unknown, opts?: { checkRequired?: boolean }): Issue[];
