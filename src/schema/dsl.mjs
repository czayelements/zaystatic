/**
 * zay-static alan tanım dili.
 *
 * Tek kaynak: aynı tanımdan hem siteyi derleyen okuyucu (varsayılanları
 * dolduran `normalize`) hem de panelin formları çıkıyor; ikisi ayrı yazılsaydı
 * panelin yazdığı ile sitenin okuduğu zamanla ayrışırdı. Bu dosya düz `.mjs`:
 * Node betikleri (derleme) de, TypeScript (panel) de aynı kodu içe aktarıyor.
 *
 * `normalize`: eksik alan şema varsayılanıyla tamamlanıyor, boş metin `""`,
 * boş liste `[]`, eksik nesne alt alanlarının varsayılanlarıyla dolu nesne.
 * Dosyada yalnız dolu alanlar olsa bile okuyan kod hep aynı biçimi görüyor.
 *
 * `i18n` işareti (yalnız dil başına dosyalı koleksiyonlarda anlamlı):
 *   "translate" → alan her dil dosyasında kendi değeriyle durur
 *   (işaretsiz)  → yalnız varsayılan dilin dosyasında
 */

const base = (type, label, o = {}) => ({ type, label, ...o });

/** Tek satır metin. */
export const str = (label, o = {}) => base("string", label, { default: "", ...o });
/** Çok satırlı metin. */
export const text = (label, o = {}) => base("text", label, { default: "", ...o });
/** Görsel adresi: panelde yükleme + doğrudan bağlantı yapıştırma; dosyada düz metin (URL ya da yol). */
export const image = (label, o = {}) => base("image", label, { default: "", ...o });
/** Markdown/MDX kaynak metni (kayıpsız: panelde yalnız ham mod). */
export const markdown = (label, o = {}) => base("markdown", label, { default: "", ...o });
export const int = (label, o = {}) => base("int", label, { default: null, ...o });
export const bool = (label, def = false, o = {}) => base("bool", label, { default: def, ...o });
export const select = (label, options, def = options[0]?.value ?? "", o = {}) =>
  base("select", label, { options, default: def, ...o });
/** YYYY-MM-DD */
export const date = (label, o = {}) => base("date", label, { default: null, ...o });
/** YYYY-MM-DDTHH:mm (UTC sayılır; bkz. content-shape.mjs → fromDatetime) */
export const datetime = (label, o = {}) => base("datetime", label, { default: null, ...o });
/** Başka bir koleksiyondaki kaydın adresi (dosya adı). */
export const relation = (label, collection, o = {}) =>
  base("relation", label, { collection, default: null, ...o });
export const relations = (label, collection, o = {}) =>
  base("relations", label, { collection, default: [], ...o });
export const list = (label, item, o = {}) => base("list", label, { item, ...o });
export const obj = (label, fields, o = {}) => base("object", label, { fields, ...o });
export const strList = (label, itemLabel = "Madde", o = {}) =>
  list(label, str(itemLabel), o);

/* ── Okuyucu: şemaya göre varsayılan doldurma ───────────────────── */

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
    case "object": {
      const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
      return Object.fromEntries(
        Object.entries(desc.fields).map(([key, field]) => [key, normalize(field, src[key])]),
      );
    }
    default:
      throw new Error(`bilinmeyen alan türü: ${desc.type}`);
  }
}

/** Şemanın tüm alanları için varsayılanlardan oluşan kayıt. */
export const defaults = (fields) => normalize(obj("", fields), {});

/* ── Dil dosyası şeması: yalnız çevrilebilir alanlar ────────────── */

/**
 * `i18n: "translate"` işaretli alanların alt şeması. Liste ve nesnelerde
 * yalnız çevrilebilir alt alanlar kalır (örn. galeri → yalnız `alt`).
 */
export function translatableFields(fields) {
  const out = {};
  for (const [key, f] of Object.entries(fields)) {
    if (f.i18n !== "translate") continue;
    if (f.type === "object") out[key] = { ...f, fields: translatableFields(f.fields) };
    else if (f.type === "list" && f.item.type === "object")
      out[key] = { ...f, item: { ...f.item, fields: translatableFields(f.item.fields) } };
    else out[key] = f;
  }
  return out;
}

/* ── Örnekten şema ──────────────────────────────────────────────── */

/**
 * Bir JSON değerinin yapısından alan şeması çıkarır (arayüz metinleri gibi
 * elle şema yazılmayan dosyalar için). Metin → string/text, dizi → liste,
 * nesne → nesne. Her alan çevrilebilir işaretli ve zorunlu değil.
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

/** Değer "boş" mu? (metin boş, liste/nesne yalnız boşlardan oluşuyor, bool false, sayı yok) */
export function isEmptyValue(v) {
  if (v == null || v === "" || v === false) return true;
  if (Array.isArray(v)) return v.every(isEmptyValue);
  if (typeof v === "object") return Object.values(v).every(isEmptyValue);
  return false;
}
