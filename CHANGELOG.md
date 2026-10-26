# Changelog

## 0.1.0 (unreleased)

- Content translation is an `i18n: { enabled, fields }` setting on collections and singletons (replaces the `layout` option; `layout: "locales"` still works).
- Visual block builder (`createBlockBuilder`): canvas drawn by your own block previews, palette to drag blocks in, settings of the selected block, translation-aware.
- Generic extensibility: `editors` (several custom editors per collection or singleton, language-aware) and per-field `widget`s, both registered by name in `<ZayApp>`; panel parts exported from `@czayelements/zaystatic/ui`.
- Schema DSL with typed fields, blocks, per-locale files, file sets.
- Panel: language tabs, drag-and-drop lists, image upload (S3-compatible or repo), custom editors.
- Stores: local files and GitHub (one commit per save, fast-forward only).
- GitHub sign-in with sealed sessions and CSRF-guarded writes.
- Validation rules (required, length, pattern, min/max, item counts), enforced server-side and in the panel.
- Language management: the package owns the panel languages (English, Turkish); picker, remembered choice, opt-in browser detection; per-language schema labels (`{ en, tr }`). Projects cannot add or override panel strings.
- Panel UI is i18n-based (`src/ui/locales/`), English and Turkish bundled.
- Media library (list/delete on adapters, Media tab, picker in image fields).
- Optional pull-request workflow with a Review tab.
- Sidebar areas (Content / Media / Review) and automatic Collections / Singletons / File sets sections.
- Reader API (`@czayelements/zaystatic/reader`): `createReader` and `createGitHubReader`, language-aware.
- `repo.pathPrefix` / `ZAY_PATH_PREFIX`: content inside a sub-folder of the repository.
- Adapters: Next.js, Node `http`/Express, any fetch-style runtime.
