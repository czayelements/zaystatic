import { allPages, headings } from "@/lib/content";

export const dynamic = "force-static";

/** A small index for the ⌘K search: page titles, descriptions and headings. */
export function GET() {
  const index = allPages().map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    headings: headings(p.body).map((h) => ({ text: h.text, id: h.id })),
    text: p.body.replace(/```[\s\S]*?```/g, " ").replace(/[#*`>|_-]+/g, " ").replace(/\s+/g, " ").slice(0, 4000),
  }));
  return Response.json(index);
}
