import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { writeEntry, writeSingleton } from "../src/core/content";
import { fsStore } from "../src/core/store-fs";
import { createGitHubReader, createReader, overlay } from "../src/reader";
import { startFakeGithub } from "./fake-github";
import { config, tmp } from "./helpers";

const seed = async () => {
  const root = await tmp();
  const cfg = config(root);
  const ctx = { config: cfg, store: fsStore(root) };
  await writeEntry(ctx, "items", "lamp", {
    tr: { title: "Lamba", price: "10", links: [{ label: "Satın al", href: "/buy" }, { label: "Kılavuz", href: "/guide" }] },
    en: { title: "Lamp", links: [{ label: "Buy" }, { label: "" }] }, // second label not translated yet
  }, { create: true });
  await writeEntry(ctx, "items", "chair", { tr: { title: "Sandalye", price: "20" } }, { create: true });
  await writeEntry(ctx, "people", "ada", { tr: { name: "Ada", bio: "Matematikçi" } }, { create: true });
  await writeEntry(ctx, "posts", "hello", { tr: { title: "Merhaba", status: "live", body: "# Selam" }, en: { title: "Hello", body: "# Hi" } }, { create: true });
  await writeSingleton(ctx, "settings", { tr: { title: "Site" } });
  await mkdir(join(root, "messages/tr"), { recursive: true });
  await writeFile(join(root, "messages/tr/nav.json"), JSON.stringify({ home: "Ana sayfa" }));
  await mkdir(join(root, "messages/en"), { recursive: true });
  await writeFile(join(root, "messages/en/nav.json"), JSON.stringify({ home: "Home" }));
  return { root, cfg };
};

test("overlay: translated values win, empty ones fall back, lists line up by position", () => {
  assert.deepEqual(overlay({ a: "x", b: "y", n: 1 }, { a: "X", b: "" }), { a: "X", b: "y", n: 1 });
  assert.deepEqual(overlay([{ alt: "a", src: "1" }, { alt: "b", src: "2" }], [{ alt: "A" }, { alt: "" }]), [{ alt: "A", src: "1" }, { alt: "b", src: "2" }]);
  assert.deepEqual(overlay(["a", "b", "c"], ["A", ""]), ["A", "b", "c"]); // shorter translation keeps the rest
  assert.equal(overlay("keep", ""), "keep");
});

test("local reader: lists, reads documents with schema defaults, languages and fallbacks", async () => {
  const { cfg } = await seed();
  const reader = createReader(cfg);

  assert.deepEqual(await reader.collections.items!.list(), ["chair", "lamp"]);
  assert.deepEqual((await reader.collections.items!.locales("lamp")).sort(), ["en", "tr"]);

  const tr = await reader.collections.items!.read("lamp");
  assert.equal(tr!.title, "Lamba");
  assert.equal(tr!.price, "10");

  const en = await reader.collections.items!.read("lamp", { locale: "en" });
  assert.equal(en!.title, "Lamp"); // translated
  assert.equal(en!.price, "10"); // not translated: from the default language
  assert.deepEqual(en!.links, [{ label: "Buy", href: "/buy" }, { label: "Kılavuz", href: "/guide" }]); // positional merge, gaps filled

  const only = await reader.collections.items!.read("lamp", { locale: "en", fallback: false });
  assert.equal(only!.title, "Lamp");
  assert.equal(only!.price, undefined); // a translation holds translated fields only

  // a language with no file at all: the default language's document
  assert.equal((await reader.collections.items!.read("chair", { locale: "en" }))!.title, "Sandalye");

  assert.equal(await reader.collections.items!.read("nope"), null);
  assert.deepEqual(Object.keys((await reader.collections.items!.docs("lamp"))!).sort(), ["en", "es", "tr"]); // one document per configured language

  const all = await reader.collections.items!.all({ locale: "en" });
  assert.deepEqual(all.map((r) => [r.slug, r.entry.title]), [["chair", "Sandalye"], ["lamp", "Lamp"]]);
});

test("local reader: MDX body, plain collections, singletons and file sets", async () => {
  const { cfg } = await seed();
  const reader = createReader(cfg);
  assert.equal((await reader.collections.posts!.read("hello", { locale: "en" }))!.body, "# Hi");
  assert.equal((await reader.collections.posts!.read("hello"))!.status, "live");
  assert.deepEqual(await reader.collections.people!.read("ada"), { name: "Ada", bio: "Matematikçi", isPublished: true });
  assert.equal((await reader.singletons.settings!.read())!.title, "Site");
  assert.deepEqual(await reader.fileSets.messages!.files(), ["base", "nav"]); // the set lists its fixed file plus every scanned one
  assert.equal((await reader.fileSets.messages!.read("nav", { locale: "en" }))!.home, "Home");
  assert.equal(await reader.fileSets.messages!.read("nope"), null);
});

test("a singleton that was never saved reads as null", async () => {
  const reader = createReader(config(await tmp()));
  assert.equal(await reader.singletons.settings!.read(), null);
});

test("GitHub reader: same documents, fetched through the API, with a content folder inside the repository", async () => {
  const { root, cfg } = await seed();
  const files: Record<string, string> = {};
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isDirectory()) walk(full);
      else files[`site/${full.slice(root.length + 1)}`] = readFileSync(full, "utf8"); // the content sits in site/ of the repository
    }
  };
  walk(root);
  const gh = await startFakeGithub(files);
  try {
    const reader = createGitHubReader(cfg, { repo: "o/r", token: "tok", apiUrl: gh.url, pathPrefix: "site" });
    assert.deepEqual(await reader.collections.items!.list(), ["chair", "lamp"]);
    const en = await reader.collections.items!.read("lamp", { locale: "en" });
    assert.deepEqual([en!.title, en!.price], ["Lamp", "10"]);
    assert.equal((await reader.collections.posts!.read("hello", { locale: "en" }))!.body, "# Hi");
    assert.equal((await reader.singletons.settings!.read())!.title, "Site");
    assert.equal(await reader.collections.items!.read("ghost"), null);
    assert.throws(() => createGitHubReader(cfg, { repo: "broken", token: "t" }), /owner\/name/);

    // without the prefix the repository root has no content
    const wrong = createGitHubReader(cfg, { repo: { owner: "o", name: "r" }, token: "tok", apiUrl: gh.url });
    assert.deepEqual(await wrong.collections.items!.list(), []);
  } finally {
    gh.close();
  }
});
