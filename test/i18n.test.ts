import assert from "node:assert/strict";
import { test } from "node:test";

import { dictionaries, resolveMessages } from "../src/ui/i18n";

test("the package ships English only (more languages arrive through locales/ or project `translations`)", () => {
  assert.deepEqual(Object.keys(dictionaries), ["en"]);
});

test("every bundled language defines every key of the English source", () => {
  const keys = Object.keys(dictionaries.en!).sort();
  for (const [code, dict] of Object.entries(dictionaries)) {
    assert.deepEqual(Object.keys(dict).sort(), keys, `language "${code}" is out of sync with English`);
  }
});

test("English is the default; missing keys fall back; host overrides win", () => {
  assert.equal(resolveMessages(undefined).save, "Save");
  assert.equal(resolveMessages("xx").save, "Save"); // unknown language
  assert.equal(resolveMessages("xx", { save: "Speichern" }).save, "Speichern"); // a language the package does not ship
  assert.equal(resolveMessages("xx", { save: "Speichern" }).cancel, "Cancel"); // partial: rest is English
  assert.equal(resolveMessages("de", { save: "Speichern" }).save, "Speichern");
  assert.equal(resolveMessages("en", { save: "Store" }).save, "Store"); // overrides apply to English too
});
