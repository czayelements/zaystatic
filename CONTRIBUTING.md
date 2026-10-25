# Contributing

Thanks for helping. zay-static is small on purpose: Git as the backend, schema in code, a calm UI.

## Setup

```bash
pnpm install
pnpm test && pnpm typecheck && pnpm build
```

## Guidelines

- **Tests first for the core.** Anything in `src/core` or `src/schema` needs a test in `test/`
  (they run on `node:test` through `tsx`, no network).
- **Keep the server framework-agnostic.** The handler is `(Request) => Response`; adapters
  (`src/next`, `src/node`) stay thin. Do not import a framework from `src/core`.
- **Keep the on-disk format stable.** Content files are the user's data. Changes to how
  entries are serialised need a migration note in the changelog.
- **No dependencies without a reason.** The S3 signer is hand-written to avoid the AWS SDK; prefer
  that spirit.
- **English only** in code, comments, errors and docs. Translations of the panel UI live in
  `src/ui/i18n.ts`; add a dictionary there for a new language.
- **Accessibility and small screens** matter: the panel must stay usable on a phone.

## Reporting security issues

Please do not open a public issue. Email the maintainer (see `package.json`) or use GitHub's
private vulnerability reporting once the repository is public.
