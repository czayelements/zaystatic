import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import matter from "gray-matter";
import GithubSlugger from "github-slugger";

const root = join(process.cwd(), "content");

export type Page = { slug: string; title: string; description: string; body: string };
export type NavSection = { title: string; pages: { slug: string; title: string }[] };
export type Heading = { depth: 2 | 3; text: string; id: string };

export function allPages(): Page[] {
  const dir = join(root, "docs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => {
      const { data, content } = matter(readFileSync(join(dir, f), "utf8"));
      return { slug: f.slice(0, -4), title: String(data.title ?? f), description: String(data.description ?? ""), body: content.replace(/^\n+/, "") };
    });
}

export function getPage(slug: string): Page | undefined {
  return allPages().find((p) => p.slug === slug);
}

type Raw = { sections?: { title?: string; pages?: string[] }[] };

/** Sidebar: the order and grouping chosen in the panel; pages nobody placed land in "More". */
export function navigation(): NavSection[] {
  const file = join(root, "navigation.json");
  const raw: Raw = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const pages = new Map(allPages().map((p) => [p.slug, p]));
  const placed = new Set<string>();
  const sections: NavSection[] = (raw.sections ?? []).map((s) => ({
    title: s.title ?? "",
    pages: (s.pages ?? []).flatMap((slug) => {
      const p = pages.get(slug);
      if (!p || placed.has(slug)) return [];
      placed.add(slug);
      return [{ slug, title: p.title }];
    }),
  }));
  const rest = [...pages.values()].filter((p) => !placed.has(p.slug)).map((p) => ({ slug: p.slug, title: p.title }));
  if (rest.length) sections.push({ title: "More", pages: rest });
  return sections.filter((s) => s.pages.length);
}

export function neighbours(slug: string) {
  const flat = navigation().flatMap((s) => s.pages);
  const i = flat.findIndex((p) => p.slug === slug);
  return { prev: i > 0 ? flat[i - 1] : undefined, next: i >= 0 && i < flat.length - 1 ? flat[i + 1] : undefined };
}

/** h2/h3 of a page (code fences skipped), with the ids rehype-slug will give them. */
export function headings(body: string): Heading[] {
  const slugger = new GithubSlugger();
  const out: Heading[] = [];
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) fence = !fence;
    if (fence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const text = m[2]!.replace(/[`*_]/g, "");
    out.push({ depth: m[1]!.length as 2 | 3, text, id: slugger.slug(text) });
  }
  return out;
}

export type Home = { title: string; subtitle: string; features: { title: string; text: string }[] };

export function home(): Home {
  const file = join(root, "home.json");
  const raw = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  return { title: raw.title ?? "", subtitle: raw.subtitle ?? "", features: raw.features ?? [] };
}
