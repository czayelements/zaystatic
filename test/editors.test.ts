/* eslint-disable @typescript-eslint/no-explicit-any -- tests read loosely-typed JSON */
import assert from "node:assert/strict";
import { test } from "node:test";

import { createHandler } from "../src/core/api";
import { str } from "../src/schema/dsl.mjs";
import { defineCollection, defineConfig, defineSingleton, resolveConfig } from "../src/core/types";
import { tmp } from "./helpers";

const schemaOf = async (extra: object) => {
  const config = resolveConfig(
    defineConfig({
      root: await tmp(), locales: ["en"], defaultLocale: "en", basePath: "/p", apiPath: "/api/zay",
      collections: {
        shorthand: defineCollection({ label: "S", dir: "s", identifier: "t", fields: { t: str("T") }, editor: "roadmap" }),
        many: defineCollection({
          label: "M", dir: "m", identifier: "t",
          fields: { t: str("T"), color: str("Colour", { widget: "color" }) },
          editors: ["plain", { name: "board", label: { en: "Board", tr: "Pano" }, languages: "self" }, { name: "first", default: true }],
        }),
        none: defineCollection({ label: "N", dir: "n", identifier: "t", fields: { t: str("T") } }),
      },
      singletons: { home: defineSingleton({ label: "H", file: "h.json", fields: { a: str("A") }, editors: [{ name: "page", label: "Page" }] }) },
      ...extra,
    }),
  );
  const res = await createHandler(config)(new Request("http://localhost/api/zay/schema?lang=tr"));
  return (await res.json()) as any;
};

test("editors: any collection or singleton can offer several custom editors", async () => {
  const schema = await schemaOf({});
  // the old `editor: "name"` shorthand opens first, like before
  assert.deepEqual(schema.collections.shorthand.editors, [{ name: "roadmap", default: true, languages: "tabs" }]);
  assert.ok(!("editor" in schema.collections.shorthand));
  // a bare name is "the default view"; specs choose label, default and how languages are handled
  assert.deepEqual(schema.collections.many.editors, [
    { name: "plain", default: true, languages: "tabs" },
    { name: "board", label: "Pano", default: false, languages: "self" }, // label resolved to the panel language
    { name: "first", default: true, languages: "tabs" },
  ]);
  assert.deepEqual(schema.collections.none.editors, []);
  assert.deepEqual(schema.singletons.home.editors, [{ name: "page", label: "Page", default: false, languages: "tabs" }]);
});

test("a field's widget name reaches the panel untouched", async () => {
  const schema = await schemaOf({});
  assert.equal(schema.collections.many.fields.color.widget, "color");
  assert.equal(schema.collections.many.fields.t.widget, undefined);
});
