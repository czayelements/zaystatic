# zaystatic example

A small Next.js site that mounts the zaystatic panel and edits one translated home page with the block builder. Previews are drawn with zay-ui. The screenshots on the docs home page are taken from it.

```bash
pnpm install
pnpm --filter zaystatic-showcase dev   # http://localhost:3300
```

The content lives in `content/home.<locale>.json`; the schema is `zaystatic.schema.ts`.
