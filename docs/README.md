# zaystatic docs and promo site

The documentation and promo site of zaystatic, in the same repository as the package (like Keystatic's `docs/`). Built with Next.js; **its pages are edited with zaystatic itself.**

```bash
pnpm install                 # from the repo root
pnpm --filter @czayelements/zaystatic build
pnpm dev:docs                # http://localhost:3100
```

- Pages: `content/docs/*.mdx` (frontmatter `title`, `description`; MDX with `<Callout>` and `<Steps>`).
- Sidebar order and sections: `content/navigation.json` (a drag-and-drop list in the panel).
- Home page headline and feature cards: `content/home.json`.
- Edit with the panel: open **http://localhost:3100/zaystatic** (local mode, no sign-in), or press "Edit with zaystatic" at the bottom of any docs page in development.
- Content model of this site: `zaystatic.schema.ts`; settings: `zaystatic.config.ts`.
- Screenshots on the landing page: `public/screens/`.

## Deploying

The site is mostly static. The panel and its API route (`/zaystatic`, `/api/zaystatic`) need a Node runtime and stay closed in production unless the `ZAY_*` environment variables are set (see the authentication page of the docs). Edit `site.config.ts` for the repository and npm links.

## Publishing to GitHub Pages

`pnpm build:pages` (from the repo root) writes a static export to `docs/out`. The editing panel and its API need a server, so they are left out of that build. `.github/workflows/pages.yml` runs it on every push to `main` with `NEXT_PUBLIC_BASE_PATH=/zaystatic`.
