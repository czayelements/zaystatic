# zaystatic

> [!WARNING]
> **Under development.** zaystatic is an early alpha (`0.1.0-alpha`). It is not production-ready: the public API may change without notice, and the GitHub sign-in, the pull-request workflow and the S3/R2 storage have so far been tested against fake servers and local setups, not yet against real services. Try it, break it and [open an issue](https://github.com/czayelements/zaystatic/issues), but do not put it in front of a site you cannot afford to break.

A Git-based content panel. Your content stays as plain files in your repository; zaystatic gives editors a polished panel to change it and commits straight to your branch. No database, no hosted service.

- Schema-driven forms, shared with your build
- Per-language content, with the fields you choose
- Drag-and-drop lists, typed blocks and a visual page builder that draws pages with your own components
- Image uploads to any S3-compatible bucket or your repo, with a media library
- Validation, an optional pull-request workflow, custom editors and widgets
- A framework-agnostic server, a React panel

**[Documentation and examples](docs/)** · **[Package README](packages/zaystatic/README.md)** · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md)

## Repository

This is a monorepo, like Keystatic's:

| Path | What |
| --- | --- |
| [`packages/zaystatic`](packages/zaystatic) | The npm package `@czayelements/zaystatic` (server, panel UI, schema helpers, tests). |
| [`docs`](docs) | The documentation and promo site (Next.js). Its pages are edited with zaystatic itself. |

```bash
pnpm install
pnpm test                 # the package's tests
pnpm build                # build the package
pnpm dev:docs             # docs + promo site on http://localhost:3100 (panel at /zaystatic)
```

## License

[MIT](LICENSE)
