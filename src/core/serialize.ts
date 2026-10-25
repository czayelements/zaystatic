import YAML from "yaml";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * File text → plain object. "mdx": YAML frontmatter + body (into the `bodyKey` field).
 * Leading/trailing newlines of the body are dropped: formatting is not content.
 */
export function parseDoc(text: string, ext: "json" | "mdx", bodyKey: string, file: string): Record<string, unknown> {
  try {
    if (ext === "mdx") {
      const m = FRONTMATTER.exec(text);
      if (!m) throw new Error("frontmatter (--- … ---) not found");
      const data = (YAML.parse(m[1]!, { schema: "core" }) ?? {}) as Record<string, unknown>;
      return { ...data, [bodyKey]: m[2]!.replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, "") };
    }
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${file}: could not be read (${(error as Error).message})`);
  }
}

/** Date-looking strings stay quoted in YAML (so parsers do not turn them into Dates). */
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
