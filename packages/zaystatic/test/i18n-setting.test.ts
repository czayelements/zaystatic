/* eslint-disable @typescript-eslint/no-explicit-any -- tests read loosely-typed JSON */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { createHandler } from "../src/core/api";
import { listEntries, readEntry, readSingleton, writeEntry, writeSingleton } from "../src/core/content";
import { fsStore } from "../src/core/store-fs";
import { isI18n, translatableOf } from "../src/core/translation";
import { defineCollection, defineConfig, defineSingleton, resolveConfig } from "../src/core/types";
import { block, blocks, list, markdown, obj, select, str, text } from "../src/schema/dsl.mjs";
import { tmp } from "./helpers";

const fields = {
  title: str("Title"),
  slug: str("Slug"),
  kind: select("Kind", [{ label: "A", value: "a" }], "a"),
  body: markdown("Body"),
  gallery: list("Gallery", obj("", { src: str("Src"), alt: str("Alt") })),
  meta: obj("Meta", { seo: str("SEO"), code: str("Code") }),
  parts: blocks("Parts", { hero: block("Hero", { headline: str("Headline"), cta: str("CTA") }) }),
};

test("isI18n: off by default, true / { enabled } switch it on, legacy layout still works", () => {
  assert.equal(isI18n({}), false);
  assert.equal(isI18n({ i18n: true }), true);
  assert.equal(isI18n({ i18n: false }), false);
  assert.equal(isI18n({ i18n: { fields: ["title"] } }), true);
  assert.equal(isI18n({ i18n: { enabled: false, fields: ["title"] } }), false);
  assert.equal(isI18n({ layout: "locales" }), true);
  assert.equal(isI18n({ layout: "plain" }), false);
  assert.equal(isI18n({ layout: "locales", i18n: false }), false); // the new setting wins
});

test("translatable fields come from i18n.fields, with dotted paths into lists, objects and blocks", () => {
  const picked = translatableOf({ fields, i18n: { enabled: true, fields: ["title", "gallery.alt", "meta.seo", "parts.headline"] } });
  assert.deepEqual(Object.keys(picked), ["title", "gallery", "meta", "parts"]);
  assert.deepEqual(Object.keys(picked.gallery!.item!.fields!), ["alt"]);
  assert.deepEqual(Object.keys(picked.meta!.fields!), ["seo"]);
  assert.deepEqual(Object.keys(picked.parts!.blocks!.hero!.fields), ["headline"]);
  // a whole field wins over a deeper path to it
  assert.deepEqual(Object.keys(translatableOf({ fields, i18n: { fields: ["gallery", "gallery.alt"] } }).gallery!.item!.fields!), ["src", "alt"]);
});

test("without a list: per-field markers, then every top-level text field", () => {
  const marked = { a: str("A", { i18n: "translate" }), b: str("B") };
  assert.deepEqual(Object.keys(translatableOf({ fields: marked, i18n: true })), ["a"]);
  assert.deepEqual(Object.keys(translatableOf({ fields, i18n: true })), ["title", "slug", "body"]); // text-like only
  assert.deepEqual(Object.keys(translatableOf({ fields: { t: text("T"), n: select("N", [], "") }, i18n: true })), ["t"]);
});

test("a typo in i18n.fields is reported, not silently ignored", () => {
  assert.throws(() => translatableOf({ fields, i18n: { fields: ["titel"] } }), /unknown field "titel"/);
});

const setup = async (collection: ReturnType<typeof defineCollection>, singleton?: ReturnType<typeof defineSingleton>) => {
  const root = await tmp();
  const config = resolveConfig(
    defineConfig({
      root, locales: ["tr", "en"], defaultLocale: "tr", basePath: "/p", apiPath: "/api/zay",
      collections: { things: collection },
      ...(singleton ? { singletons: { home: singleton } } : {}),
    }),
  );
  return { root, ctx: { config, store: fsStore(root) }, handler: createHandler(config) };
};

test("collection with i18n.fields: other languages store and show only the chosen fields", async () => {
  const { root, ctx } = await setup(defineCollection({ label: "T", dir: "things", identifier: "title", ext: "json", i18n: { enabled: true, fields: ["title", "gallery.alt"] }, fields }));
  await writeEntry(ctx, "things", "a", {
    tr: { title: "Ev", slug: "ev", gallery: [{ src: "/1.png", alt: "bir" }] },
    en: { title: "Home", slug: "must-not-be-kept", gallery: [{ src: "/hacked.png", alt: "one" }] },
  }, { create: true });
  const en = JSON.parse(await readFile(join(root, "things/a.en.json"), "utf8"));
  assert.deepEqual(en, { title: "Home", gallery: [{ alt: "one" }] }); // slug and gallery.src are not translated fields
  const back = await readEntry(ctx, "things", "a");
  assert.equal(back.i18n, true);
  assert.deepEqual(Object.keys(back.docs.en!), ["title", "gallery"]);
});

test("i18n off: one file, one language, any format; i18n: { enabled: false } is the same", async () => {
  for (const i18n of [undefined, false as const, { enabled: false, fields: ["title"] }]) {
    const { root, ctx } = await setup(defineCollection({ label: "T", dir: "things", identifier: "title", ext: "mdx", ...(i18n === undefined ? {} : { i18n }), fields: { title: str("T"), body: markdown("B") } }));
    await writeEntry(ctx, "things", "a", { tr: { title: "Hello", body: "# Hi" }, en: { title: "ignored" } }, { create: true });
    assert.deepEqual(await readdir(join(root, "things")), ["a.mdx"]); // a plain MDX collection, no locale suffix
    assert.equal((await readEntry(ctx, "things", "a")).i18n, false);
    assert.deepEqual(Object.keys((await readEntry(ctx, "things", "a")).docs), ["tr"]);
    assert.deepEqual((await listEntries(ctx, "things")).map((r) => r.slug), ["a"]);
  }
});

test("legacy layout: 'locales' keeps working (maps to i18n: true)", async () => {
  const { root, ctx } = await setup(defineCollection({ label: "T", dir: "things", identifier: "title", layout: "locales", ext: "json", fields: { title: str("T", { i18n: "translate" }), n: str("N") } }));
  await writeEntry(ctx, "things", "a", { tr: { title: "Ev" }, en: { title: "Home" } }, { create: true });
  assert.deepEqual((await readdir(join(root, "things"))).sort(), ["a.en.json", "a.tr.json"]);
});

test("singletons can be translated too: <name>.<locale>.json", async () => {
  const { root, ctx, handler } = await setup(
    defineCollection({ label: "T", dir: "things", identifier: "title", fields: { title: str("T") } }),
    defineSingleton({ label: { en: "Home", tr: "Ana sayfa" }, file: "content/home.json", i18n: { fields: ["headline"] }, fields: { headline: str("Headline"), theme: str("Theme") } }),
  );
  await writeSingleton(ctx, "home", { tr: { headline: "Merhaba", theme: "dark" }, en: { headline: "Hello", theme: "ignored" } });
  assert.deepEqual((await readdir(join(root, "content"))).sort(), ["home.en.json", "home.tr.json"]);
  assert.deepEqual(JSON.parse(await readFile(join(root, "content/home.en.json"), "utf8")), { headline: "Hello" });
  const read = await readSingleton(ctx, "home");
  assert.equal(read.i18n, true);
  assert.equal(read.docs.tr!.theme, "dark");

  // clearing a translation removes its file
  await writeSingleton(ctx, "home", { tr: { headline: "Merhaba", theme: "dark" }, en: { headline: "" } });
  assert.deepEqual((await readdir(join(root, "content"))).sort(), ["home.tr.json"]);

  // over HTTP, including the schema the panel reads
  const schema = await (await handler(new Request("http://localhost/api/zay/schema"))).json() as any;
  assert.deepEqual([schema.singletons.home.i18n, Object.keys(schema.singletons.home.i18nFields)], [true, ["headline"]]);
  assert.equal(schema.collections.things.i18n, false);
  assert.equal(schema.collections.things.i18nFields, undefined);
  assert.ok(!("layout" in schema.collections.things));
  const put = await handler(new Request("http://localhost/api/zay/singletons/home", { method: "PUT", headers: { "x-zay-request": "1", "content-type": "application/json" }, body: JSON.stringify({ doc: { headline: "Legacy", theme: "x" } }) }));
  assert.equal(put.status, 200); // a lone `doc` still means the default language
});
