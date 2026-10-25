import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { deleteEntry, listEntries, readEntry, readFileSet, writeEntry, writeFileSet, writeSingleton, readSingleton } from "../src/core/content";
import { fsStore } from "../src/core/store-fs";
import { HttpError } from "../src/core/types";
import type { Collection } from "../src/core/types";
import { config, tmp } from "./helpers";

const setup = async () => {
  const root = await tmp();
  const cfg = config(root);
  return { root, ctx: { config: cfg, store: fsStore(root) } };
};

const rejects = (p: Promise<unknown>, status: number) =>
  assert.rejects(p, (e: unknown) => e instanceof HttpError && e.status === status);

test("i18n on: one file per filled language, empty ones are not written", async () => {
  const { root, ctx } = await setup();
  const res = await writeEntry(ctx, "posts", "hello", {
    tr: { title: "Merhaba", status: "live", tags: ["a", "b"], body: "# Selam\n\nMetin" },
    en: { title: "Hello", tags: ["x", "y"], body: "# Hi" },
    es: { title: "", tags: [], body: "" },
  }, { create: true });
  assert.equal(res.files, 2);
  assert.deepEqual((await readdir(join(root, "content/posts"))).sort(), ["hello.en.mdx", "hello.tr.mdx"]);

  const tr = await readFile(join(root, "content/posts/hello.tr.mdx"), "utf8");
  assert.match(tr, /^---\ntitle: Merhaba\nstatus: live\ntags:\n {2}- a\n {2}- b\n---\n# Selam\n\nMetin\n$/);
  const en = await readFile(join(root, "content/posts/hello.en.mdx"), "utf8");
  assert.doesNotMatch(en, /status/); // non-default locales carry translatable fields only

  const back = await readEntry(ctx, "posts", "hello");
  assert.equal(back.docs.tr!.body, "# Selam\n\nMetin");
  assert.equal(back.docs.en!.title, "Hello");
  assert.equal(back.docs.es!.title, "");
  assert.deepEqual(back.existing.sort(), ["en", "tr"]);
});

test("emptying a translation deletes its file", async () => {
  const { root, ctx } = await setup();
  await writeEntry(ctx, "posts", "p", { tr: { title: "T" }, en: { title: "E" } }, { create: true });
  await writeEntry(ctx, "posts", "p", { tr: { title: "T" }, en: { title: "" } }, { create: false });
  assert.deepEqual(await readdir(join(root, "content/posts")), ["p.tr.mdx"]);
});

test("saving without changes commits nothing", async () => {
  const { ctx } = await setup();
  await writeEntry(ctx, "people", "ada", { tr: { name: "Ada", bio: "x" } }, { create: true });
  const again = await writeEntry(ctx, "people", "ada", { tr: { name: "Ada", bio: "x" } }, { create: false });
  assert.equal((again as { unchanged?: boolean }).unchanged, true);
  assert.equal(again.files, 0);
});

test("validation: slug, duplicates, empty identifier, unknown names", async () => {
  const { ctx } = await setup();
  await rejects(writeEntry(ctx, "people", "Bad Slug", { tr: { name: "x" } }, { create: true }), 400);
  await rejects(writeEntry(ctx, "people", "../evil", { tr: { name: "x" } }, { create: true }), 400);
  await writeEntry(ctx, "people", "ok", { tr: { name: "x" } }, { create: true });
  await rejects(writeEntry(ctx, "people", "ok", { tr: { name: "x" } }, { create: true }), 409);
  await rejects(writeEntry(ctx, "people", "blank", { tr: { name: "  " } }, { create: true }), 422);
  await rejects(readEntry(ctx, "people", "missing"), 404);
  await rejects(listEntries(ctx, "constructor"), 404);
  await rejects(listEntries(ctx, "__proto__"), 404);
});

test("list: titles, summary templates, locales, sorted", async () => {
  const { ctx } = await setup();
  await writeEntry(ctx, "posts", "b-post", { tr: { title: "Bravo", status: "live" }, en: { title: "B" } }, { create: true });
  await writeEntry(ctx, "posts", "a-post", { tr: { title: "Alfa" } }, { create: true });
  const rows = await listEntries(ctx, "posts");
  assert.deepEqual(rows.map((r) => [r.slug, r.title, r.summary, r.locales.sort().join()]), [
    ["a-post", "Alfa", "Alfa · draft", "tr"],
    ["b-post", "Bravo", "Bravo · live", "en,tr"],
  ]);
});

test("list: configurable sort (desc by field, missing last, ties by title)", async () => {
  const { ctx } = await setup();
  (ctx.config.collections.items as Collection).sort = { field: "price", order: "desc" };
  await writeEntry(ctx, "items", "a", { tr: { title: "A", price: "1" } }, { create: true });
  await writeEntry(ctx, "items", "b", { tr: { title: "B", price: "3" } }, { create: true });
  await writeEntry(ctx, "items", "c", { tr: { title: "C" } }, { create: true });
  await writeEntry(ctx, "items", "d", { tr: { title: "D", price: "3" } }, { create: true });
  assert.deepEqual((await listEntries(ctx, "items")).map((r) => r.slug), ["b", "d", "a", "c"]);
});

test("list operations stay positional across languages (data contract)", async () => {
  const { ctx } = await setup();
  await writeEntry(ctx, "items", "i", {
    tr: { title: "A", price: "1", links: [{ label: "bir", href: "/1" }, { label: "iki", href: "/2" }] },
    en: { title: "A", links: [{ label: "one" }, { label: "two" }] },
  }, { create: true });
  const { docs } = await readEntry(ctx, "items", "i");
  assert.deepEqual(docs.en!.links, [{ label: "one" }, { label: "two" }]);
  assert.deepEqual(docs.tr!.links, [{ label: "bir", href: "/1" }, { label: "iki", href: "/2" }]);
});

test("delete removes every language file", async () => {
  const { root, ctx } = await setup();
  await writeEntry(ctx, "posts", "gone", { tr: { title: "T" }, en: { title: "E" } }, { create: true });
  await deleteEntry(ctx, "posts", "gone");
  assert.deepEqual(await readdir(join(root, "content/posts")), []);
  await rejects(deleteEntry(ctx, "posts", "gone"), 404);
});

test("singletons", async () => {
  const { ctx } = await setup();
  assert.deepEqual((await readSingleton(ctx, "settings")).exists, false);
  await writeSingleton(ctx, "settings", { tr: { title: "Site" } });
  assert.equal((await readSingleton(ctx, "settings")).docs.tr!.title, "Site");
});

test("file sets: structure comes from the default-language file", async () => {
  const { root, ctx } = await setup();
  await mkdir(join(root, "messages/tr"), { recursive: true });
  await mkdir(join(root, "messages/en"), { recursive: true });
  await writeFile(join(root, "messages/tr/nav.json"), JSON.stringify({ home: "Ana", menu: { a: "A", list: ["x", "y"] } }, null, 2) + "\n");
  await writeFile(join(root, "messages/en/nav.json"), JSON.stringify({ home: "Home", menu: { a: "A!", list: ["x", "y"] } }, null, 2) + "\n");

  const { fields, docs } = await readFileSet(ctx, "messages", "nav");
  assert.deepEqual(Object.keys(fields), ["home", "menu"]);
  assert.equal(docs.en!.home, "Home");
  assert.equal(docs.es!.home, ""); // missing language file → empty form

  docs.en!.home = "Homepage";
  await writeFileSet(ctx, "messages", "nav", { en: docs.en });
  assert.match(await readFile(join(root, "messages/en/nav.json"), "utf8"), /"home": "Homepage"/);
  await rejects(readFileSet(ctx, "messages", "../x"), 404);
});
