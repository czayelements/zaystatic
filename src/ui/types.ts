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
  language: "en" | "tr";
  apiPath: string;
  basePath: string;
  /** Yükleme açıksa sınırlar; kapalıysa null (yalnız bağlantı yapıştırma). */
  media: { maxBytes: number; accept: string[] } | null;
};

export type EntrySummary = {
  slug: string;
  title: string;
  summary: string;
  locales: string[];
  published?: boolean;
};

export type Docs = Record<string, Record<string, unknown>>;

/** Özel editör sözleşmesi: form yerine/yanında gösterilen, siteye özgü editör. */
export type EditorProps = {
  slug: string;
  fields: Fields;
  locales: string[];
  defaultLocale: string;
  localeNames: Record<string, string>;
  /** Varsayılan dilin belgesi (düz koleksiyonlarda tek belge). */
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export type EditorMap = Record<string, React.ComponentType<EditorProps>>;
