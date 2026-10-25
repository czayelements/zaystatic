export type FieldType =
  | "string" | "text" | "markdown" | "image" | "int" | "bool" | "select"
  | "date" | "datetime" | "relation" | "relations" | "list" | "object";

export interface SelectOption { label: string; value: string }

export interface Field {
  type: FieldType;
  label: string;
  hint?: string;
  default?: unknown;
  /** "translate": alan her dil dosyasında kendi değeriyle durur. */
  i18n?: "translate";
  /** list/object için: panel özet şablonu, örn. "{{fields.title.tr}}". */
  summary?: string;
  /** object: alt alanlar yan yana tek satırda gösterilir (örn. {tr,en,es,de}). */
  inline?: boolean;
  pattern?: string;
  min?: number | null;
  max?: number | null;
  options?: SelectOption[];
  collection?: string;
  item?: Field;
  fields?: Record<string, Field>;
}

export type Fields = Record<string, Field>;
type Opts = Partial<Field> & Record<string, unknown>;

export function str(label: string, o?: Opts): Field;
export function text(label: string, o?: Opts): Field;
export function image(label: string, o?: Opts): Field;
export function markdown(label: string, o?: Opts): Field;
export function int(label: string, o?: Opts): Field;
export function bool(label: string, def?: boolean, o?: Opts): Field;
export function select(label: string, options: SelectOption[], def?: string, o?: Opts): Field;
export function date(label: string, o?: Opts): Field;
export function datetime(label: string, o?: Opts): Field;
export function relation(label: string, collection: string, o?: Opts): Field;
export function relations(label: string, collection: string, o?: Opts): Field;
export function list(label: string, item: Field, o?: Opts): Field;
export function obj(label: string, fields: Fields, o?: Opts): Field;
export function strList(label: string, itemLabel?: string, o?: Opts): Field;

/* eslint-disable @typescript-eslint/no-explicit-any -- normalize() returns the shape the schema describes */
export function normalize(desc: Field, raw: unknown): any;
export function defaults(fields: Fields): any;
/* eslint-enable @typescript-eslint/no-explicit-any */
export function translatableFields(fields: Fields): Fields;
export function fieldsFromSample(sample: unknown, opts?: { longText?: (v: string) => boolean }): Fields;
export function isEmptyValue(v: unknown): boolean;
