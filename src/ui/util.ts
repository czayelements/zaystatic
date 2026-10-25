/** Fills `{{a.b}}` placeholders from the document (a `fields.` prefix is ignored). */
export function renderTemplate(tpl: string, data: unknown): string {
  return tpl
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
      let v: unknown = data;
      for (const key of path.replace(/^fields\./, "").split(".")) v = (v as Record<string, unknown> | null)?.[key];
      return v == null || typeof v === "object" ? "" : String(v);
    })
    .replace(/^[\s·→]+|[\s·→]+$/g, "")
    .trim();
}

export const slugify = (value: string) =>
  value
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[şŞ]/g, "s")
    .replace(/[üÜ]/g, "u")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export const uid = () => Math.random().toString(36).slice(2, 10);

export const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** Is the value empty? (same rule as isEmptyValue on the server) */
export function isEmpty(v: unknown): boolean {
  if (v == null || v === "" || v === false) return true;
  if (Array.isArray(v)) return v.every(isEmpty);
  if (typeof v === "object") return Object.entries(v as object).every(([k, x]) => k === "_type" || isEmpty(x));
  return false;
}
