import { en } from "./locales/en";
import type { Messages } from "./locales/en";

export type { Messages };

/**
 * Panel UI languages. The package ships English only. To add a language: create
 * `locales/<code>.ts` (a full `Messages` object, typed so the compiler flags missing
 * keys), register it here, and add a line to the changelog. A language a key is
 * missing from falls back to English. Projects can also bring their own strings
 * without touching the package, through `translations` in their settings.
 */
export const dictionaries: Record<string, Messages> = { en };

/**
 * English, overlaid with the chosen language, overlaid with the host's own
 * `translations` from the config (so a project can add a language, or reword
 * a string, without waiting for a package release).
 */
export function resolveMessages(language: string | undefined, overrides?: Partial<Messages>): Messages {
  return { ...en, ...(language ? dictionaries[language] : undefined), ...overrides };
}
