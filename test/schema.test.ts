import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { readEntry, writeEntry } from "../src/core/content";
import { fsStore } from "../src/core/store-fs";
import { defineCollection, defineConfig, defineSchema, resolveConfig } from "../src/core/types";
import { block, blocks, isEmptyValue, markdown, normalize, obj, str, translatableFields } from "../src/schema/dsl.mjs";
import { tmp } from "./helpers";

const sections = blocks(
  "Sections",
  {
    hero: block("Hero", { title: str("Title", { i18n: "translate" }), cta: str("CTA link") }),
    text: block("Text", { body: markdown("Body", { i18n: "translate" }) }),
  },
  { i18n: "translate" },
);

test("blocks: normalize keeps known types, fills defaults, drops unknown ones", () => {
  const out = normalize(sections, [{ _type: "hero", title: "Hi" }, { _type: "nope", x: 1 }, { _type: "text" }, "junk", null]);
  assert.deepEqual(out, [
    { _type: "hero", title: "Hi", cta: "" },
    { _type: "text", body: "" },
  ]);
  assert.deepEqual(normalize(sections, undefined), []);
});

test("blocks: the translatable subset keeps every block's type but only its translatable fields", () => {
  const { sections: sub } = translatableFields({ sections });
  assert.deepEqual(Object.keys(sub!.blocks!.hero!.fields), ["title"]);
  assert.deepEqual(Object.keys(sub!.blocks!.text!.fields), ["body"]);
  assert.equal(isEmptyValue([{ _type: "hero", title: "" }]), true); // a type alone is not content
  assert.equal(isEmptyValue([{ _type: "hero", title: "x" }]), false);
});

test("blocks round-trip through per-locale files; untranslated languages write nothing", async () => {
  const root = await tmp();
  const config = resolveConfig(
    defineConfig({
      root,
      locales: ["tr", "en"],
      defaultLocale: "tr",
      basePath: "/p",
      apiPath: "/api",
      schema: defineSchema({
        collections: {
          pages: defineCollection({
            label: "Pages",
            dir: "content/pages",
            layout: "locales",
            ext: "json",
            identifier: "title",
            fields: { title: str("Title", { i18n: "translate" }), sections },
          }),
        },
      }),
    }),
  );
  const ctx = { config, store: fsStore(root) };
  await writeEntry(ctx, "pages", "home", {
    tr: { title: "Ana", sections: [{ _type: "hero", title: "Selam", cta: "/x" }, { _type: "text", body: "Metin" }] },
    en: { title: "Home", sections: [{ _type: "hero", title: "Hello" }, { _type: "text", body: "" }] },
  }, { create: true });

  const tr = JSON.parse(await readFile(join(root, "content/pages/home.tr.json"), "utf8"));
  assert.deepEqual(tr.sections.map((s: { _type: string }) => s._type), ["hero", "text"]);
  const en = JSON.parse(await readFile(join(root, "content/pages/home.en.json"), "utf8"));
  assert.deepEqual(en.sections, [{ _type: "hero", title: "Hello" }, { _type: "text", body: "" }]); // positional, no cta

  const back = await readEntry(ctx, "pages", "home");
  assert.equal((back.docs.tr!.sections as { cta?: string }[])[0]!.cta, "/x");
  assert.equal((back.docs.en!.sections as { title?: string }[])[0]!.title, "Hello");
});

test("config and schema live in separate files and merge; top-level definitions win", () => {
  const schema = defineSchema({
    groups: [{ id: "g", label: "G" }],
    collections: { a: defineCollection({ label: "A", dir: "a", layout: "plain", identifier: "t", fields: { t: str("T") } }) },
  });
  const merged = resolveConfig(
    defineConfig({
      locales: ["en"], defaultLocale: "en", basePath: "/p", apiPath: "/api",
      schema,
      collections: { a: defineCollection({ label: "Override", dir: "a", layout: "plain", identifier: "t", fields: { t: str("T") } }), b: defineCollection({ label: "B", dir: "b", layout: "plain", identifier: "t", fields: { t: str("T") } }) },
    }),
  );
  assert.deepEqual(Object.keys(merged.collections), ["a", "b"]);
  assert.equal(merged.collections.a!.label, "Override");
  assert.deepEqual(merged.groups, [{ id: "g", label: "G" }]);
  assert.deepEqual(merged.singletons, {});
  assert.ok(!("schema" in merged));
});

test("object fields still normalize inside blocks", () => {
  const b = blocks("B", { card: block("Card", { meta: obj("Meta", { a: str("A") }) }) });
  assert.deepEqual(normalize(b, [{ _type: "card" }]), [{ _type: "card", meta: { a: "" } }]);
});
