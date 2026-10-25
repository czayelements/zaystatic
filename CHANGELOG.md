# Changelog

## 0.1.0 (unreleased)

- Schema DSL with typed fields, blocks, per-locale files, file sets.
- Panel: language tabs, drag-and-drop lists, image upload (S3-compatible or repo), custom editors.
- Stores: local files and GitHub (one commit per save, fast-forward only).
- GitHub sign-in with sealed sessions and CSRF-guarded writes.
- Validation rules (required, length, pattern, min/max, item counts), enforced server-side and in the panel.
- Panel UI is i18n-based: English default, `language` + `translations` in the settings, `tr` bundled.
- Adapters: Next.js, Node `http`/Express, any fetch-style runtime.
