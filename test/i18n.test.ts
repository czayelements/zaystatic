import assert from "node:assert/strict";
import { test } from "node:test";

import { PANEL_LANGUAGES } from "../src/core/languages";
import { dictionaries, resolveMessages } from "../src/ui/i18n";

test("the package decides the panel languages: the dictionaries and PANEL_LANGUAGES are the same list", () => {
  assert.deepEqual(Object.keys(dictionaries).sort(), [...PANEL_LANGUAGES].sort());
  assert.deepEqual([...PANEL_LANGUAGES], ["en", "tr"]);
});

test("every bundled language defines every key of the English source", () => {
  const keys = Object.keys(dictionaries.en!).sort();
  for (const [code, dict] of Object.entries(dictionaries)) {
    assert.deepEqual(Object.keys(dict).sort(), keys, `language "${code}" is out of sync with English`);
  }
});

test("English is the default; unknown languages and missing keys fall back to it", () => {
  assert.equal(resolveMessages(undefined).save, "Save");
  assert.equal(resolveMessages("xx").save, "Save");
  dictionaries.de = { save: "Speichern" } as never; // a future, partial language
  try {
    assert.equal(resolveMessages("de").save, "Speichern");
    assert.equal(resolveMessages("de").cancel, "Cancel");
  } finally {
    delete dictionaries.de;
  }
});

test("Turkish is a first-class bundled language", () => {
  assert.equal(resolveMessages("tr").save, "Kaydet");
  assert.equal(resolveMessages("tr").cancel, "Vazgeç");
});
