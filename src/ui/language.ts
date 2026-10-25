import { dictionaries } from "./i18n";
import type { SessionInfo } from "./types";

const KEY = "zay.language";

/** Languages the panel can show: the bundled ones, those the project translated, and the configured default. */
export function availableLanguages(session: Pick<SessionInfo, "language" | "translations">): string[] {
  return [...new Set([...Object.keys(dictionaries), ...Object.keys(session.translations ?? {}), session.language])];
}

const read = () => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null; // private mode / blocked storage
  }
};

export function storeLanguage(code: string) {
  try {
    window.localStorage.setItem(KEY, code);
  } catch {
    /* the choice just will not persist */
  }
}

/**
 * Which language to start in: the one the user picked before, else (opt-in) the
 * browser's, else the project's configured language, else English.
 */
export function initialLanguage(session: Pick<SessionInfo, "language" | "translations" | "autoDetectLanguage">): string {
  const available = availableLanguages(session);
  const stored = read();
  if (stored && available.includes(stored)) return stored;
  if (session.autoDetectLanguage && typeof navigator !== "undefined") {
    for (const wanted of navigator.languages ?? [navigator.language]) {
      const match = available.find((a) => a.toLowerCase() === wanted.toLowerCase()) ?? available.find((a) => a.toLowerCase() === wanted.split("-")[0]!.toLowerCase());
      if (match) return match;
    }
  }
  return available.includes(session.language) ? session.language : "en";
}

/** A language's name in that language ("Deutsch", "Türkçe"); the code when the runtime cannot tell. */
export function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch {
    return code;
  }
}
