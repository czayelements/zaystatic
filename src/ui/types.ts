import type { Fields } from "../schema/dsl.mjs";
import type { Collection, Singleton } from "../core/types";

export type Schema = {
  locales: string[];
  defaultLocale: string;
  localeNames: Record<string, string>;
  groups: { id: string; label: string }[];
  collections: Record<string, Collection>;
  singletons: Record<string, Singleton>;
  fileSets: Record<string, { label: string; group?: string }>;
};

export type SessionInfo = {
  mode: "local" | "github" | "unconfigured";
  user: { login: string; name?: string; avatar?: string } | null;
  repo: string | null;
  branch: string;
  name: string;
  /** Panel UI language code (see `locales/`). */
  language: string;
  /** The host's own string overrides / extra language, from `translations` in the config. */
  messages?: Record<string, string>;
  apiPath: string;
  basePath: string;
  /** Limits when uploads are enabled; null when disabled (paste-a-link only). */
  media: { maxBytes: number; accept: string[]; library: boolean; canDelete: boolean } | null;
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
