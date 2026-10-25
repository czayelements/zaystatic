import { en } from "./locales/en";
import type { Messages } from "./locales/en";
import { tr } from "./locales/tr";

export type { Messages };

/**
 * Panel UI languages. To add one: create `locales/<code>.ts` (a full `Messages`
 * object, typed so the compiler flags missing keys), register it here, and add a
 * line to the changelog. Any key a language does not define falls back to English.
 */
export const dictionaries: Record<string, Messages> = { en, tr };

/**
 * English, overlaid with the chosen language, overlaid with the host's own
 * `translations` from the config (so a project can add a language, or reword
 * a string, without waiting for a package release).
 */
export function resolveMessages(language: string | undefined, overrides?: Partial<Messages>): Messages {
  return { ...en, ...(language ? dictionaries[language] : undefined), ...overrides };
}
