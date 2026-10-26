import type { Field, Fields } from "../schema/dsl.mjs";
import type { ResolvedEditor } from "../core/i18n";
import type { Collection, Singleton } from "../core/types";

/** The server resolves every label to the panel's language before sending the schema. */
type Resolved<T> = Omit<T, "label" | "i18n"> & {
  label: string;
  /** Custom editors offered next to the standard form. */
  editors: ResolvedEditor[];
  /** Is the content translated (one file per language)? */
  i18n: boolean;
  /** The fields the non-default language tabs show, when translation is on. */
  i18nFields?: Fields;
};

export type Schema = {
  locales: string[];
  defaultLocale: string;
  localeNames: Record<string, string>;
  groups: { id: string; label: string }[];
  collections: Record<string, Resolved<Collection>>;
  singletons: Record<string, Resolved<Singleton>>;
  fileSets: Record<string, { label: string; group?: string }>;
};

export type SessionInfo = {
  mode: "local" | "github" | "unconfigured";
  user: { login: string; name?: string; avatar?: string } | null;
  repo: string | null;
  branch: string;
  name: string;
  /** How saves are published. */
  workflow: "direct" | "pull-request";
  /** Default panel language (a language the package ships). */
  language: string;
  /** Languages the package ships; the picker offers these. */
  languages: string[];
  /** Start in the browser's language when available. */
  autoDetectLanguage: boolean;
  apiPath: string;
  basePath: string;
  /** Limits when uploads are enabled; null when disabled (paste-a-link only). */
  media: { maxBytes: number; accept: string[]; library: boolean; canDelete: boolean } | null;
};

export type DraftRef = { number: number; url: string; branch: string; previewUrl?: string };

export type DraftInfo = DraftRef & {
  target: { kind: "c" | "s" | "f"; name: string; slug?: string; file?: string };
  title: string;
  updatedAt: string;
  author?: { login: string; avatar?: string };
};

export type EntrySummary = {
  slug: string;
  title: string;
  summary: string;
  locales: string[];
  published?: boolean;
};

export type Docs = Record<string, Record<string, unknown>>;

/**
 * Contract of a custom editor: a React component of your site, registered by name in
 * `<ZayApp editors={...} />` and attached to a collection or singleton with `editors: [...]`.
 * It shows the same document the standard form edits, in whatever shape suits your data.
 *
 * Reading and writing: `value` is the active language's document and `onChange` replaces it. For
 * translated content with `languages: "self"` use `docs` / `setDocs` (every language) instead.
 * Saving, validation, drafts and the language tabs stay with the panel. Build on the panel's own
 * parts (`PanelForm`, `ImageInput`, `MediaLibrary`, `useZay`) exported from `@czayelements/zaystatic/ui`.
 */
export type EditorProps = {
  kind: "collection" | "singleton";
  /** The collection / singleton key. */
  name: string;
  /** Entry address; undefined for singletons and for an entry that is not saved yet. */
  slug?: string;
  isNew: boolean;
  /** Every field of the default language. */
  fields: Fields;
  /** The fields translated into the other languages (when translation is on). */
  i18nFields?: Fields;
  /** The fields that apply to the active language. */
  activeFields: Fields;
  locales: string[];
  defaultLocale: string;
  localeNames: Record<string, string>;
  /** Is the content translated? */
  translated: boolean;
  activeLocale: string;
  setActiveLocale: (locale: string) => void;
  /** All documents, one per language (one entry for untranslated content). */
  docs: Docs;
  setDocs: (next: Docs) => void;
  /** The active language's document. */
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** Validation messages by field path (`"items.0.title"`) for the active language, and whether to show them yet. */
  errors: Record<string, string[]>;
  showErrors: boolean;
};

export type EditorMap = Record<string, React.ComponentType<EditorProps>>;

/** Contract of a custom field widget (`widget: "name"` on a field, registered in `<ZayApp widgets={...} />`). */
export type WidgetProps = {
  field: Field;
  value: unknown;
  onChange: (next: unknown) => void;
  /** Path of the field inside its document. */
  path: (string | number)[];
  /** Validation messages for this field (empty until the first failed save). */
  errors: string[];
  /** In a translation tab: the default language's value. */
  reference?: unknown;
  translating: boolean;
};

export type WidgetMap = Record<string, React.ComponentType<WidgetProps>>;
