import type { Fields } from "../schema/dsl.mjs";
import type { Label } from "./i18n";
import type { PanelLanguage } from "./languages";
import type { I18nOption } from "./translation";

export type { I18nOption };
import type { MediaConfig } from "./media";

export type { Label };

/** A sidebar collection: the files in a folder are its entries. */
export type Collection = {
  /** A string, or a map of language -> text (`{ en: "Posts", de: "Beiträge" }`). */
  label: Label;
  /** Folder relative to the repository root, e.g. "content/blog". */
  dir: string;
  /**
   * @deprecated Use `i18n`. `"locales"` means `i18n: true`; `"plain"` (or omitted) means no translation.
   */
  layout?: "plain" | "locales";
  /**
   * Translate this collection's content. Off by default. When on, every entry is one file per
   * language (`<slug>.<locale>.<ext>`): the default language's file carries every field, the
   * others only the translated ones, which are the listed `fields` (dotted paths reach into
   * nested fields: `"gallery.alt"`), else the fields marked `i18n: "translate"`, else the text fields.
   */
  i18n?: I18nOption;
  /** File format: "json" (default) or "mdx" (YAML frontmatter + body). */
  ext?: "json" | "mdx";
  /** Field shown as the title in lists. */
  identifier: string;
  /** Second line of a list row, e.g. "{{title}} · {{publishedAt}}". */
  summary?: string;
  fields: Fields;
  /** List order; defaults to title A→Z. The field value may be text, a number or a date. */
  sort?: { field: string; order?: "asc" | "desc" };
  /** Sidebar group (ZayConfig.groups[].id). */
  group?: string;
  /**
   * Custom editors for this collection: your own React components, registered by name in
   * `<ZayApp editors={...} />`. Each one appears next to the standard form as a view the editor
   * can switch to, and renders the data however the site wants (a diagram, a page preview, a
   * kanban …). A name is shorthand for `{ name, default: true }`.
   */
  editors?: (string | EditorSpec)[];
  /** @deprecated Use `editors: ["name"]`. */
  editor?: string;
};

/** Single-file content (settings, menus …). */
/** A custom editor offered for a collection or singleton. */
export type EditorSpec = {
  /** Key in the `editors` map given to `<ZayApp>`. */
  name: string;
  /** Switcher label (string or per-language map); defaults to the panel's "Visual editor". */
  label?: Label;
  /** Open this view first (default: the standard form, unless the old `editor: "name"` shorthand is used). */
  default?: boolean;
  /**
   * "tabs" (default): when the content is translated the panel shows the language tabs and hands
   * the editor the active language's document. "self": the editor receives every language's
   * document and handles languages itself.
   */
  languages?: "tabs" | "self";
};

export type Singleton = {
  /** Custom editors, like `Collection.editors`. */
  editors?: (string | EditorSpec)[];
  /** Translate this single file (stored as `<name>.<locale>.json`); see Collection.i18n. */
  i18n?: I18nOption;
  label: Label;
  file: string;
  fields: Fields;
  group?: string;
};

export type FileSetFile = { name: string; label: Label; path: string };

/**
 * Files with the same shape in every language (UI strings, for example). The
 * schema is not written by hand: it is derived from the default language's file.
 * Path templates use `{locale}` (and `{name}` with `scan`).
 */
export type FileSet = {
  label: Label;
  group?: string;
  files?: FileSetFile[];
  /** Every `.json` in the folder counts as a file. The `dir` and `path` templates contain `{locale}`. */
  scan?: { dir: string; path: string; labels?: Record<string, Label> };
};

/** The content model: which kinds of content exist and their fields. Can live in a file of its own, apart from the settings (ZayConfig). */
export type ZaySchema = {
  /** Sidebar groups (they appear in the order given here). */
  groups?: { id: string; label: Label }[];
  collections?: Record<string, Collection>;
  singletons?: Record<string, Singleton>;
  fileSets?: Record<string, FileSet>;
};

/**
 * Panel settings. The content model is given under `schema` (or directly as
 * `collections`, `singletons`, `fileSets`, `groups`); the two are merged.
 */
export type ZayConfig = ZaySchema & {
  /** Title of the panel. */
  name?: string;
  locales: string[];
  defaultLocale: string;
  localeNames?: Record<string, string>;
  /** Path of the panel page (the Next.js page lives here). */
  basePath: string;
  /** Path of the API (the Next.js route handler lives here). */
  apiPath: string;
  /**
   * How saves are published (GitHub mode only; local mode always writes directly).
   *  - "direct" (default): a save is a commit to the configured branch.
   *  - "pull-request": a save goes to a draft branch and opens a pull request; a
   *    Review page lists drafts to publish (merge) or discard.
   */
  workflow?: "direct" | WorkflowConfig;
  /** In production, content is committed to this GitHub repository. */
  repo?: { owner: string; name: string; branch?: string; /** GitHub Enterprise: API root, e.g. https://ghe.example.com/api/v3 */ apiUrl?: string };
  /** Content model (zay.schema.ts). */
  schema?: ZaySchema;
  /** Image uploads (optional): s3Media(...), repoMedia() or your own MediaAdapter. */
  media?: MediaConfig;
  /**
   * Language of the panel UI. Only languages shipped with the package are available
   * (see PANEL_LANGUAGES); default "en". Visitors can switch with the picker when more than one exists.
   */
  language?: PanelLanguage;
  /**
   * Start in the browser's language when the package ships it (a language picked in the
   * panel always wins). Default false.
   */
  autoDetectLanguage?: boolean;
  /** Local file root (default: process.cwd()). */
  root?: string;
};

export type WorkflowConfig = {
  mode: "direct" | "pull-request";
  /** Draft branches are `<prefix>c/<collection>/<slug>`, `<prefix>s/<name>`, `<prefix>f/<set>/<file>`. Default "zay/". */
  branchPrefix?: string;
  /** Link to a rendered preview of a draft; `{pr}` and `{branch}` are replaced. e.g. "https://deploy-preview-{pr}--mysite.netlify.app" */
  previewUrl?: string;
  /** How publishing merges the pull request. Default "squash". */
  mergeMethod?: "squash" | "merge" | "rebase";
};

/** `schema` merged with the top-level definitions; the engine reads only this. */
export type ResolvedConfig = Omit<ZayConfig, keyof ZaySchema | "schema"> & {
  groups: NonNullable<ZaySchema["groups"]>;
  collections: Record<string, Collection>;
  singletons: Record<string, Singleton>;
  fileSets: Record<string, FileSet>;
};

export function resolveConfig(config: ZayConfig): ResolvedConfig {
  const { schema, groups, collections, singletons, fileSets, ...settings } = config;
  return {
    ...settings,
    groups: groups ?? schema?.groups ?? [],
    collections: { ...schema?.collections, ...collections },
    singletons: { ...schema?.singletons, ...singletons },
    fileSets: { ...schema?.fileSets, ...fileSets },
  };
}

/* Definition helpers: for type checking and completion; identity functions at runtime. */
export const defineConfig = <T extends ZayConfig>(config: T): T => config;
export const defineSchema = <T extends ZaySchema>(schema: T): T => schema;
export const defineCollection = (c: Collection): Collection => c;
export const defineSingleton = (s: Singleton): Singleton => s;
export const defineFileSet = (f: FileSet): FileSet => f;

/** A pull request that holds an unpublished draft. */
export type DraftRef = { number: number; url: string; branch: string; previewUrl?: string };

export type Change = {
  path: string;
  /** null → delete the file. */
  content: string | null;
  encoding?: "utf-8" | "base64";
};

export interface Store {
  readonly kind: "fs" | "github";
  /** File names in the folder (subfolders excluded); empty if the folder does not exist. */
  list(dir: string): Promise<string[]>;
  /** Every file under `dir`, recursively, as full repository paths (empty if the folder does not exist). */
  listTree(dir: string): Promise<string[]>;
  read(path: string): Promise<string | null>;
  /** All changes in one commit (GitHub) / written in order (local). */
  commit(changes: Change[], message: string): Promise<{ id?: string; url?: string; draft?: DraftRef }>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Validation issues (status 422), keyed by language so the panel can mark the right tab. */
    public issues?: { locale: string; path: (string | number)[]; code: string; params?: Record<string, unknown> }[],
  ) {
    super(message);
  }
}
