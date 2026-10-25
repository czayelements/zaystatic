import assert from "node:assert/strict";
import { test } from "node:test";

import { writeEntry, writeSingleton } from "../src/core/content";
import { fsStore } from "../src/core/store-fs";
import { defineCollection, defineConfig, defineSingleton, resolveConfig, HttpError } from "../src/core/types";
import { block, blocks, image, int, list, obj, relations, str, validateDoc } from "../src/schema/dsl.mjs";
import { tmp } from "./helpers";

const codes = (issues: { path: (string | number)[]; code: string }[]) => issues.map((i) => `${i.path.join(".")}:${i.code}`).sort();

test("text rules: required, minLength, maxLength, pattern (with message)", () => {
  const fields = {
    title: str("Title", { required: true, maxLength: 5 }),
    slug: str("Slug", { pattern: "^[a-z-]+$", patternMessage: "lowercase only", minLength: 2 }),
  };
  assert.deepEqual(codes(validateDoc(fields, { title: "  ", slug: "" })), ["title:required"]); // empty optional text is fine
  assert.deepEqual(codes(validateDoc(fields, { title: "toolong", slug: "A" })), ["slug:minLength", "slug:pattern", "title:maxLength"]);
  assert.deepEqual(validateDoc(fields, { title: "ok", slug: "fine" }), []);
  const [issue] = validateDoc(fields, { title: "ok", slug: "NO" });
  assert.equal(issue!.params?.message, "lowercase only");
});

test("numbers, lists, blocks, relations and nesting", () => {
  const fields = {
    n: int("N", { required: true, min: 1, max: 3 }),
    tags: list("Tags", str("Tag", { required: true }), { minItems: 1, maxItems: 2 }),
    people: relations("People", "p", { required: true }),
    sections: blocks("S", { hero: block("Hero", { title: str("T", { required: true }) }) }),
    meta: obj("Meta", { a: image("A", { required: true }) }),
  };
  assert.deepEqual(
    codes(validateDoc(fields, { n: null, tags: [], people: [], sections: [{ _type: "hero", title: "" }], meta: { a: "" } })),
    ["meta.a:required", "n:required", "people:required", "sections.0.title:required", "tags:minItems"],
  );
  assert.deepEqual(codes(validateDoc(fields, { n: 9, tags: ["a", "", "c"], people: ["x"], sections: [], meta: { a: "/i.png" } })), ["n:max", "tags.1:required", "tags:maxItems"]);
});

test("pattern accepts [regex, message]", () => {
  const f = { y: str("Year", { pattern: ["^\\d{4}$", "Four-digit year"] }) };
  assert.deepEqual(validateDoc(f, { y: "2026" }), []);
  assert.equal(validateDoc(f, { y: "26" })[0]!.params?.message, "Four-digit year");
});

test("an invalid regular expression in the schema never blocks editing", () => {
  assert.deepEqual(validateDoc({ a: str("A", { pattern: "([" }) }, { a: "x" }), []);
});

const setup = async () => {
  const root = await tmp();
  const config = resolveConfig(
    defineConfig({
      root,
      locales: ["tr", "en"],
      defaultLocale: "tr",
      basePath: "/p",
      apiPath: "/api",
      collections: {
        posts: defineCollection({
          label: "Posts", dir: "content/posts", layout: "locales", ext: "json", identifier: "title",
          fields: {
            title: str("Title", { i18n: "translate", maxLength: 10 }),
            summary: str("Summary", { i18n: "translate", required: true }),
            slug: str("Slug", { pattern: "^[a-z-]*$" }),
          },
        }),
      },
      singletons: { site: defineSingleton({ label: "Site", file: "content/site.json", fields: { name: str("Name", { required: true }) } }) },
    }),
  );
  return { ctx: { config, store: fsStore(root) } };
};

test("save is rejected with per-language issues; nothing is written", async () => {
  const { ctx } = await setup();
  await assert.rejects(
    writeEntry(ctx, "posts", "a", { tr: { title: "x", summary: "", slug: "BAD" }, en: { title: "this title is far too long" } }, { create: true }),
    (e: unknown) => {
      assert.ok(e instanceof HttpError && e.status === 422);
      assert.deepEqual(codes((e as HttpError).issues!.map((i) => ({ ...i, path: [i.locale, ...i.path] }))), ["en.title:maxLength", "tr.slug:pattern", "tr.summary:required"]);
      return true;
    },
  );
  assert.deepEqual(await ctx.store.list("content/posts"), []);
});

test("translations may be partial (required is default-language only) but filled values must be valid", async () => {
  const { ctx } = await setup();
  const ok = await writeEntry(ctx, "posts", "b", { tr: { title: "Hi", summary: "S" }, en: { title: "Hello" } }, { create: true });
  assert.equal(ok.files, 2); // en has no summary: fine
});

test("the identifier is always required; singletons are validated too", async () => {
  const { ctx } = await setup();
  await assert.rejects(writeEntry(ctx, "posts", "c", { tr: { title: " ", summary: "S" } }, { create: true }), (e: unknown) => (e as HttpError).issues!.some((i) => i.path[0] === "title" && i.code === "required"));
  await assert.rejects(writeSingleton(ctx, "site", { name: "" }), (e: unknown) => (e as HttpError).status === 422);
  await writeSingleton(ctx, "site", { name: "ok" });
});
