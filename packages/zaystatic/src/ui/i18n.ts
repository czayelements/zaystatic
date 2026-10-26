import { en } from "./locales/en";
import { tr } from "./locales/tr";
import type { Messages } from "./locales/en";

export type { Messages };

/**
 * Panel UI languages. The package ships English only. To add a language: create
 * `locales/<code>.ts` (a full `Messages` object, typed so the compiler flags missing
 * keys), register it here AND in `core/languages.ts` (PANEL_LANGUAGES), and add a line to
 * the changelog. The panel's wording belongs to the package: projects cannot add
 * languages or override strings, they only choose among these.
 */
export const dictionaries: Record<string, Messages> = { en, tr };

/** English, overlaid with the chosen language (a key a language lacks falls back to English). */
export function resolveMessages(language: string | undefined): Messages {
  return { ...en, ...(language ? dictionaries[language] : undefined) };
}
