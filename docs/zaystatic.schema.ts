import { defineCollection, defineSchema, defineSingleton } from "zaystatic";
import { list, markdown, obj, relation, str, text } from "zaystatic/schema";

/**
 * The content model of this very site. The documentation is edited with zaystatic itself
 * (open /zaystatic while running `pnpm dev:docs`).
 */
export default defineSchema({
  groups: [
    { id: "docs", label: "Documentation" },
    { id: "site", label: "Site" },
  ],
  collections: {
    docs: defineCollection({
      label: "Docs pages",
      group: "docs",
      dir: "content/docs",
      ext: "mdx",
      identifier: "title",
      summary: "{{description}}",
      fields: {
        title: str("Title", { required: true, maxLength: 80, hint: "Shown at the top of the page, in the sidebar and in search." }),
        description: text("Description", { maxLength: 220, hint: "One or two sentences under the title; also used by search engines." }),
        body: markdown("Body", { hint: "MDX: Markdown plus <Callout>, <Steps> and code fences with a language." }),
      },
    }),
  },
  singletons: {
    navigation: defineSingleton({
      label: "Sidebar",
      group: "docs",
      file: "content/navigation.json",
      fields: {
        sections: list(
          "Sections",
          obj("", {
            title: str("Section title", { required: true }),
            pages: list("Pages", relation("Page", "docs"), { hint: "Drag to reorder; the order here is the order in the sidebar and for previous/next links." }),
          }),
          { summary: "{{fields.title}}" },
        ),
      },
    }),
    home: defineSingleton({
      label: "Home page",
      group: "site",
      file: "content/home.json",
      fields: {
        title: str("Headline", { required: true }),
        subtitle: text("Sub-headline"),
        features: list(
          "Features",
          obj("", { title: str("Title", { required: true }), text: text("Text") }),
          { summary: "{{fields.title}}", maxItems: 9 },
        ),
      },
    }),
  },
});
