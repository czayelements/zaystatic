# zaystatic

A Git-based content panel. Your content stays as plain files in your repository; zaystatic gives editors a polished panel to change it and commits straight to your branch. No database, no hosted service.

- Schema-driven forms, shared with your build
- Per-language content, with the fields you choose
- Drag-and-drop lists, typed blocks and a visual page builder that draws pages with your own components
- Image uploads to any S3-compatible bucket or your repo, with a media library
- Validation, an optional pull-request workflow, custom editors and widgets
- A framework-agnostic server, a React panel

**[Documentation and examples](docs/)** · **[Package README](packages/zaystatic/README.md)** · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

> Status: 0.x. The on-disk content format is meant to stay stable; the public API may still change before 1.0.

## Repository

This is a monorepo, like Keystatic's:

| Path | What |
| --- | --- |
| [`packages/zaystatic`](packages/zaystatic) | The npm package `zaystatic` (server, panel UI, schema helpers, tests). |
| [`docs`](docs) | The documentation and promo site (Next.js). Its pages are edited with zaystatic itself. |

```bash
pnpm install
pnpm test                 # the package's tests
pnpm build                # build the package
pnpm dev:docs             # docs + promo site on http://localhost:3100 (panel at /zaystatic)
```

## License

Not chosen yet. Add a `LICENSE` file before publishing.
