import { defineSchema, defineSingleton } from "@czayelements/zaystatic";
import { block, blocks, list, obj, str, text } from "@czayelements/zaystatic/schema";

/** One translated home page, drawn with the block builder. */
export default defineSchema({
  singletons: {
    home: defineSingleton({
      label: "Home page",
      file: "content/home.json",
      editors: [{ name: "page", label: "Page builder", default: true }],
      i18n: { enabled: true, fields: ["sections.title", "sections.body", "sections.cta", "sections.heading", "sections.items.title", "sections.items.text"] },
      fields: {
        sections: blocks("Sections", {
          hero: block(
            "Hero",
            { title: str("Title", { required: true }), body: text("Body"), cta: str("Button label") },
            { icon: "H", description: "Big headline with a button" },
          ),
          features: block(
            "Features",
            {
              heading: str("Heading"),
              items: list("Items", obj("", { title: str("Title", { required: true }), text: text("Text") }), { summary: "{{fields.title}}" }),
            },
            { icon: "F", description: "A grid of short feature cards" },
          ),
        }),
      },
    }),
  },
});
