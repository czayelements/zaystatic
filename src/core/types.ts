import type { Fields } from "../schema/dsl.mjs";
import type { MediaConfig } from "./media";

/** Sidebar'da bir koleksiyon: klasördeki dosyalar = kayıtlar. */
export type Collection = {
  label: string;
  /** Repo köküne göre klasör, örn. "content/blog". */
  dir: string;
  /**
   * "plain":   `<slug>.json` — bir dosya bir kayıt.
   * "locales": `<slug>.<locale>.<ext>` — dil başına dosya; varsayılan dilin
   *            dosyası tüm alanları, diğerleri yalnız `i18n: "translate"` alanlarını taşır.
   */
  layout: "plain" | "locales";
  /** Yalnız "locales": dosya uzantısı. "mdx" → YAML frontmatter + gövde. */
  ext?: "json" | "mdx";
  /** Listede başlık olarak gösterilen alan. */
  identifier: string;
  /** Liste satırının ikinci satırı, örn. "{{title}} · {{publishedAt}}". */
  summary?: string;
  fields: Fields;
  /** Liste sırası; yoksa başlığa göre A→Z. Alan değeri metin, sayı ya da tarih olabilir. */
  sort?: { field: string; order?: "asc" | "desc" };
  /** Kenar çubuğu grubu (ZayConfig.groups[].id). */
  group?: string;
  /** Özel editör adı (ZayApp `editors` içinde kayıtlı); form yerine/yanında gösterilir. */
  editor?: string;
};

/** Tek dosyalık içerik (ayarlar, menü …). */
export type Singleton = {
  label: string;
  file: string;
  fields: Fields;
  group?: string;
};

export type FileSetFile = { name: string; label: string; path: string };

/**
 * Dil başına aynı yapıda dosyalar (arayüz metinleri gibi). Şema elle yazılmaz:
 * varsayılan dilin dosyasının yapısından çıkarılır.
 * Yol şablonunda `{locale}` (ve `scan` ile `{name}`) kullanılır.
 */
export type FileSet = {
  label: string;
  group?: string;
  files?: FileSetFile[];
  /** Klasördeki her `.json` bir dosya sayılır. `dir` ve `path` şablonları `{locale}` içerir. */
  scan?: { dir: string; path: string; labels?: Record<string, string> };
};

export type ZayConfig = {
  /** Panelin başlığı. */
  name?: string;
  locales: string[];
  defaultLocale: string;
  localeNames?: Record<string, string>;
  /** Panelin sayfa adresi (Next.js sayfası burada). */
  basePath: string;
  /** API'nin adresi (Next.js route handler burada). */
  apiPath: string;
  /** Üretimde içerik bu GitHub deposuna commit edilir. */
  repo?: { owner: string; name: string; branch?: string };
  groups?: { id: string; label: string }[];
  collections: Record<string, Collection>;
  singletons?: Record<string, Singleton>;
  fileSets?: Record<string, FileSet>;
  /** Panel arayüzünün dili. */
  language?: "en" | "tr";
  /** Görsel yükleme (isteğe bağlı): s3Media(...), repoMedia() ya da kendi MediaAdapter'ın. */
  media?: MediaConfig;
  /** Yerel dosya kökü (varsayılan: process.cwd()). */
  root?: string;
};

export const defineConfig = <T extends ZayConfig>(config: T): T => config;

export type Change = {
  path: string;
  /** null → dosyayı sil. */
  content: string | null;
  encoding?: "utf-8" | "base64";
};

export interface Store {
  readonly kind: "fs" | "github";
  /** Klasördeki dosya adları (alt klasörler hariç); klasör yoksa boş. */
  list(dir: string): Promise<string[]>;
  read(path: string): Promise<string | null>;
  /** Tüm değişiklikler tek commit (GitHub) / sırayla yazım (yerel). */
  commit(changes: Change[], message: string): Promise<{ id?: string; url?: string }>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
