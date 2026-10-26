# Notes for coding agents

Start with **ROADMAP.md -> Handoff** (layout, invariants, what is verified and what is not) and pick work from
**Remaining work**. Short version:

- This is a monorepo: the package is `packages/zaystatic`, the docs/promo site is `docs/` (edited with zaystatic itself; keep its docs pages in sync with behaviour changes: docs/content/docs/*.mdx).
- `pnpm test && pnpm typecheck && pnpm build` (from the repo root) must pass before every commit; add tests for anything in `src/core` or `src/schema`.
- Keep the server framework-agnostic and the on-disk format stable (see Invariants).
- English only in code, comments, errors and docs; UI strings go in `src/ui/locales/en.ts` **and** `tr.ts` (every bundled language must define all keys). Panel languages are owned by the package (`PANEL_LANGUAGES` + `i18n.ts`); never add a project-level override.
- The czay.dev site consumes this package through `file:` (see ROADMAP.md); run `pnpm zay:sync` there after changes.
- Do not claim something works against real GitHub/S3 unless you ran it; the "Verified vs. not verified" list is part of the contract.
