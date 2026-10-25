import type { Fields } from "../schema/dsl.mjs";
import type { Collection, Singleton } from "../core/types";

/** The server resolves every label to the panel's language before sending the schema. */
type Resolved<T> = Omit<T, "label"> & { label: string };

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
  /** Panel UI language code (see `locales/`). */
  language: string;
  /** The project's own strings per language, from `translations` in the config. */
  translations: Record<string, Record<string, string>>;
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

/** Custom editor contract: a site-specific editor shown instead of / next to the form. */
export type EditorProps = {
  slug: string;
  fields: Fields;
  locales: string[];
  defaultLocale: string;
  localeNames: Record<string, string>;
  /** The default language's document (the only document in plain collections). */
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export type EditorMap = Record<string, React.ComponentType<EditorProps>>;
