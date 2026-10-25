import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bool, markdown, select, str, text, list, obj } from "../src/schema/dsl.mjs";
import { defineConfig } from "../src/core/types";

export const tmp = () => mkdtemp(join(tmpdir(), "zay-"));

export const config = (root: string) =>
  defineConfig({
    root,
    locales: ["tr", "en", "es"],
    defaultLocale: "tr",
    basePath: "/panel",
    apiPath: "/api/zay",
    collections: {
      posts: {
        label: "Posts",
        dir: "content/posts",
        layout: "locales",
        ext: "mdx",
        identifier: "title",
        summary: "{{title}} · {{status}}",
        fields: {
          title: str("Title", { i18n: "translate" }),
          status: select("Status", [{ label: "Draft", value: "draft" }, { label: "Live", value: "live" }], "draft"),
          tags: list("Tags", str("Tag", { i18n: "translate" }), { i18n: "translate" }),
          body: markdown("Body", { i18n: "translate" }),
        },
      },
      people: {
        label: "People",
        dir: "content/people",
        layout: "plain",
        identifier: "name",
        fields: { name: str("Name"), bio: text("Bio"), isPublished: bool("Published", true) },
      },
      items: {
        label: "Items",
        dir: "content/items",
        layout: "locales",
        ext: "json",
        identifier: "title",
        fields: {
          title: str("Title", { i18n: "translate" }),
          price: str("Price"),
          links: list("Links", obj("", { label: str("Label", { i18n: "translate" }), href: str("Href") }), { i18n: "translate" }),
        },
      },
    },
    singletons: { settings: { label: "Settings", file: "content/settings.json", fields: { title: str("Title") } } },
    fileSets: {
      messages: {
        label: "Messages",
        files: [{ name: "base", label: "Base", path: "messages/{locale}.json" }],
        scan: { dir: "messages/{locale}", path: "messages/{locale}/{name}.json" },
      },
    },
  });
