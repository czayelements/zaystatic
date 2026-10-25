/* eslint-disable @typescript-eslint/no-explicit-any -- tests read loosely-typed JSON */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { createHandler } from "../src/core/api";
import { localizeSchema, pickLabel } from "../src/core/i18n";
import { block, blocks, select, str } from "../src/schema/dsl.mjs";
import { defineCollection, defineConfig, resolveConfig } from "../src/core/types";
import { PANEL_LANGUAGES } from "../src/core/languages";
import { dictionaries } from "../src/ui/i18n";
import { availableLanguages, initialLanguage, languageName } from "../src/ui/language";
import { tmp } from "./helpers";

test("pickLabel: exact, base language, English, first; plain strings pass through", () => {
  const l = { en: "Posts", de: "Beiträge", "pt-BR": "Posts BR" };
  assert.equal(pickLabel(l, "de"), "Beiträge");
  assert.equal(pickLabel(l, "pt-BR"), "Posts BR");
  assert.equal(pickLabel(l, "de-AT"), "Beiträge"); // base language
  assert.equal(pickLabel(l, "fr"), "Posts"); // English fallback
  assert.equal(pickLabel({ tr: "Yazılar" }, "fr"), "Yazılar"); // first entry
  assert.equal(pickLabel("Plain", "de"), "Plain");
  assert.equal(pickLabel(undefined, "de"), "");
});

const schemaConfig = () =>
  resolveConfig(
    defineConfig({
      locales: ["en"], defaultLocale: "en", basePath: "/p", apiPath: "/api/zay",
      groups: [{ id: "g", label: { en: "Content", de: "Inhalt" } }],
      collections: {
        posts: defineCollection({
          label: { en: "Posts", de: "Beiträge" }, group: "g", dir: "c", layout: "plain", identifier: "title",
          fields: {
            title: str({ en: "Title", de: "Titel" }, { hint: { en: "Shown in lists", de: "In Listen sichtbar" }, pattern: ["^a", { en: "Start with a", de: "Mit a beginnen" }] }),
            kind: select({ en: "Kind", de: "Art" }, [{ label: { en: "News", de: "Neuigkeit" }, value: "news" }], "news"),
            parts: blocks({ en: "Parts", de: "Teile" }, { hero: block({ en: "Hero", de: "Kopf" }, { x: str({ en: "X", de: "Ix" }) }) }),
          },
        }),
      },
    }),
  );

test("localizeSchema resolves every label kind to the panel language", () => {
  const de = localizeSchema(schemaConfig(), "de") as any;
  assert.equal(de.groups[0].label, "Inhalt");
  assert.equal(de.collections.posts.label, "Beiträge");
  const f = de.collections.posts.fields;
  assert.deepEqual([f.title.label, f.title.hint, f.title.pattern[1]], ["Titel", "In Listen sichtbar", "Mit a beginnen"]);
  assert.equal(f.kind.options[0].label, "Neuigkeit");
  assert.deepEqual([f.parts.label, f.parts.blocks.hero.label, f.parts.blocks.hero.fields.x.label], ["Teile", "Kopf", "Ix"]);
  const en = localizeSchema(schemaConfig(), "en") as any;
  assert.equal(en.collections.posts.fields.title.label, "Title");
});

test("GET /schema?lang= resolves labels; the project cannot add or override panel languages", async () => {
  const root = await tmp();
  const h = createHandler({ ...schemaConfig(), root, language: "en", autoDetectLanguage: true, translations: { de: { save: "Hacked" } } } as never);
  const get = async (p: string) => (await h(new Request(`http://localhost/api/zay${p}`))).json() as Promise<any>;
  assert.equal((await get("/schema?lang=de")).collections.posts.label, "Posts"); // "de" is not a package language: English
  assert.equal((await get("/schema")).collections.posts.label, "Posts");
  const s = await get("/session");
  assert.deepEqual([s.language, s.languages, s.autoDetectLanguage, s.translations], ["en", ["en", "tr"], true, undefined]);
  const odd = createHandler({ ...schemaConfig(), root, language: "xx" } as never);
  assert.equal((await (await odd(new Request("http://localhost/api/zay/session"))).json()).language, "en");
});

test("with a package language available, ?lang= relabels the schema (simulated second language)", async () => {
  const langs = PANEL_LANGUAGES as unknown as string[];
  langs.push("de");
  try {
    const h = createHandler({ ...schemaConfig(), root: await tmp(), language: "en" });
    const res = await (await h(new Request("http://localhost/api/zay/schema?lang=de"))).json();
    assert.equal(res.collections.posts.label, "Beiträge");
  } finally {
    langs.pop();
  }
});

/* ── The panel's own language choice ───────────────────────────── */

const store: Record<string, string> = {};
const g = globalThis as any;
const setEnv = (languages: string[]) => {
  g.window = { localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v) } };
  Object.defineProperty(g, "navigator", { value: { languages, language: languages[0] }, configurable: true });
};
afterEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  delete g.window;
  delete dictionaries.de;
  delete dictionaries["pt-BR"];
});

test("available languages are exactly the package's", () => {
  assert.deepEqual(availableLanguages(), ["en", "tr"]);
});

test("initial language: stored choice > browser (opt-in) > configured > English, package languages only", () => {
  dictionaries.de = {} as never;
  dictionaries["pt-BR"] = {} as never;
  setEnv(["de-AT", "en"]);
  const base = { language: "en", autoDetectLanguage: false };
  assert.equal(initialLanguage(base), "en"); // browser ignored unless opted in
  assert.equal(initialLanguage({ ...base, autoDetectLanguage: true }), "de"); // de-AT -> de
  store["zay.language"] = "pt-BR";
  assert.equal(initialLanguage({ ...base, autoDetectLanguage: true }), "pt-BR"); // an explicit choice wins
  store["zay.language"] = "xx"; // not a package language
  assert.equal(initialLanguage(base), "en");
  assert.equal(initialLanguage({ ...base, language: "de" }), "de");
  assert.equal(initialLanguage({ ...base, language: "xx" }), "en"); // unknown default
  delete dictionaries.de;
  setEnv(["de"]);
  assert.equal(initialLanguage({ ...base, autoDetectLanguage: true }), "en"); // browser language the package lacks
});

test("language names come from the runtime in the language itself", () => {
  assert.equal(languageName("de"), "Deutsch");
  assert.equal(languageName("en"), "English");
  assert.equal(languageName("tr"), "Türkçe");
});
