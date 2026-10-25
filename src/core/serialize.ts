import YAML from "yaml";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Dosya metni → düz nesne. "mdx": YAML frontmatter + gövde (`bodyKey` alanına).
 * Gövdenin baş/son satır sonları atılır: biçimlendirme farkı içerik sayılmaz.
 */
export function parseDoc(text: string, ext: "json" | "mdx", bodyKey: string, file: string): Record<string, unknown> {
  try {
    if (ext === "mdx") {
      const m = FRONTMATTER.exec(text);
      if (!m) throw new Error("frontmatter (--- … ---) bulunamadı");
      const data = (YAML.parse(m[1]!, { schema: "core" }) ?? {}) as Record<string, unknown>;
      return { ...data, [bodyKey]: m[2]!.replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, "") };
    }
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${file}: okunamadı (${(error as Error).message})`);
  }
}

/** Tarih gibi görünen metinler YAML'da tırnaklı kalsın (ayrıştırıcılar Date'e çevirmesin). */
function yamlFrontmatter(data: Record<string, unknown>) {
  const doc = new YAML.Document(data);
  YAML.visit(doc, {
    Scalar(_key, node) {
      if (typeof node.value === "string" && /^\d{4}-\d{2}-\d{2}/.test(node.value)) node.type = "QUOTE_DOUBLE";
    },
  });
  return doc.toString({ lineWidth: 0 }).trimEnd();
}

export function serializeDoc(data: Record<string, unknown>, ext: "json" | "mdx", bodyKey: string): string {
  if (ext === "mdx") {
    const { [bodyKey]: body, ...front } = data;
    const text = typeof body === "string" ? body.replace(/^(?:\r?\n)+|\s+$/g, "") : "";
    return `---\n${yamlFrontmatter(front)}\n---\n${text}${text ? "\n" : ""}`;
  }
  return `${JSON.stringify(data, null, 2)}\n`;
}
