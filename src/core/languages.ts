/**
 * Panel UI languages shipped with the package. This list is owned by the package: a project
 * cannot add languages or change the panel's wording, it can only choose among these (the
 * dictionaries live in `src/ui/locales/`, and a test keeps both in sync).
 */
export const PANEL_LANGUAGES = ["en", "tr"] as const;
export type PanelLanguage = (typeof PANEL_LANGUAGES)[number];

export const isPanelLanguage = (code: unknown): code is PanelLanguage => PANEL_LANGUAGES.includes(code as PanelLanguage);
