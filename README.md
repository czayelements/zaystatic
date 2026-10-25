# zay-static

A small, Git-based content panel for Next.js sites. Content lives as plain files
in your repository; the panel edits them with schema-driven forms and commits
straight to your branch (your host rebuilds on push). No database, no SaaS.

- **Schema in code.** One field DSL drives both the panel's forms and your site's
  build-time reader, so what the panel writes and what the site reads cannot drift.
- **Per-locale files.** `post.tr.mdx`, `post.en.mdx` … The default-locale file
  carries every field, the others only the fields marked translatable. Language
  tabs show the source text under each field; list changes (add, remove, reorder)
  made in the default language are mirrored into the translations.
- **Drag and drop** for every list, collapsible items, duplicate, undo-friendly
  autosize inputs, ⌘S to save, unsaved-changes guard.
- **Two storage modes.** `local` writes to disk (development), `github` commits
  through the Git Data API (one commit per save, fast-forward only — a concurrent
  push is reported, never overwritten). Unchanged saves create no commit.
- **GitHub sign-in**, allow-list of users, sealed (AES-256-GCM) session cookie,
  CSRF-guarded writes. Production never falls back to local files.
- **Images: upload or paste a link.** `image()` fields take a plain URL/path, or
  an upload (file picker, drag-and-drop, clipboard paste) with preview. Uploads
  are validated server-side (size, real file type from the bytes, unsafe SVG) and
  handed to a **media adapter**: any S3-compatible storage (AWS S3, Cloudflare
  R2, MinIO, Backblaze B2, DigitalOcean Spaces…, signed with a built-in SigV4, no
  AWS SDK) or a commit into your repo (`public/uploads`).
- **Plug-in editors.** A collection can name a custom React editor (we use a
  visual roadmap diagram editor) shown next to the generic form.
- **Framework-agnostic core.** The API is `(Request) => Response`; Next.js is a
  thin adapter. The UI ships its own stylesheet (`zs-` prefixed, light/dark).

## Install

```bash
pnpm add zay-static        # peer: react, react-dom (Next.js 15+ recommended)
```

## Layout

```
src/
  schema/dsl.mjs     field DSL, normalize(), translatableFields()   (plain ESM: Node scripts can import it)
  core/              store-fs, store-github, content engine, auth, api handler
  next/              createNextHandlers(config)
  ui/                <ZayApp /> and its stylesheet
test/                node:test suites (pnpm test:zay)
```

## Mounting in a Next.js app

1. **Config** (`zay.config.ts`, server side):

   ```ts
   import { defineConfig } from "zay-static";
   import { str, text, bool, markdown, select, list, obj } from "zay-static/schema";

   export default defineConfig({
     name: "My site",
     locales: ["en", "de"],
     defaultLocale: "en",
     basePath: "/cms",          // where the page lives
     apiPath: "/api/cms",       // where the route handler lives
     repo: { owner: "me", name: "my-site", branch: "main" },
     groups: [{ id: "content", label: "Content" }],
     collections: {
       posts: {
         label: "Posts", group: "content",
         dir: "content/posts", layout: "locales", ext: "mdx", identifier: "title",
         summary: "{{title}} · {{status}}",
         fields: {
           title: str("Title", { i18n: "translate" }),
           status: select("Status", [{ label: "Draft", value: "draft" }, { label: "Live", value: "live" }], "draft"),
           body: markdown("Body", { i18n: "translate" }),
         },
       },
     },
   });
   ```

2. **API route** (`app/api/cms/[...path]/route.ts`):

   ```ts
   import { createNextHandlers } from "zay-static/next";
   import config from "@/zay.config";
   export const runtime = "nodejs";
   export const dynamic = "force-dynamic";
   export const { GET, POST, PUT, DELETE } = createNextHandlers(config);
   ```

3. **Page** (`app/cms/layout.tsx` imports `zay-static/styles.css`;
   `app/cms/[[...path]]/page.tsx` renders a client component):

   ```tsx
   "use client";
   import { ZayApp } from "zay-static/ui";
   export const Panel = () => <ZayApp apiPath="/api/cms" />;
   ```

   Give the panel its own root layout (no site chrome) and exclude its path from
   any locale-routing middleware.

## Content model

| `layout` | files | notes |
| --- | --- | --- |
| `plain` | `<slug>.json` | one file, one entry |
| `locales` | `<slug>.<locale>.json\|mdx` | default locale = all fields; others = fields with `i18n: "translate"` only. Empty translations are deleted, not written. |

`mdx` entries are YAML frontmatter + the body (the one `markdown` field).
**Singletons** are single JSON files. **File sets** (`fileSets`) are the same JSON
shape per locale (UI strings): the form is derived from the default-locale file.

Fields: `str`, `text`, `markdown`, `image`, `int`, `bool`, `select`, `date`, `datetime`,
`relation(s)`, `list`, `obj` (`{ inline: true }` renders sub-fields as one row).
Options common to all: `hint`, `default`, `i18n: "translate"`; lists/objects take
`summary: "{{fields.title}}"` for the collapsed row title.

## Environment

| variable | meaning |
| --- | --- |
| `ZAY_MODE` | `local` (disk, no login — your own machine only) or `github`. Unset: `local` in development, `github` in production. |
| `ZAY_GITHUB_CLIENT_ID` / `ZAY_GITHUB_CLIENT_SECRET` | a GitHub OAuth App; callback URL `https://<host><apiPath>/auth/callback` |
| `ZAY_SESSION_SECRET` | long random string; seals the session cookie |
| `ZAY_ALLOWED_USERS` | comma-separated GitHub logins allowed in (they also need push access to the repo) |
| `ZAY_PUBLIC_URL` | optional; the public origin when behind a proxy that hides it |

The signed-in user's own token (scope `repo`) makes the commits, so history shows
who changed what. With the variables missing in production the panel stays closed.

## Images

```ts
import { defineConfig, s3Media, s3MediaFromEnv, repoMedia } from "zay-static";

defineConfig({
  // …
  media: {
    adapter: s3Media({
      endpoint: "https://<account>.r2.cloudflarestorage.com", // omit for AWS S3
      region: "auto", bucket: "media",
      accessKeyId: process.env.S3_KEY!, secretAccessKey: process.env.S3_SECRET!,
      publicUrl: "https://cdn.example.com", // what ends up in your content
      prefix: "uploads/",
    }),
    // or: adapter: s3MediaFromEnv() ?? repoMedia()
    maxBytes: 5 * 1024 * 1024,                 // default 5 MB
    accept: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"], // add "image/svg+xml" deliberately
  },
});
```

Use `image("Cover")` in the schema. Without `media`, the field is a link input with
preview. Objects are stored as `<prefix>YYYY/MM/<slug>-<random>.<ext>` with a
one-year immutable `Cache-Control`. `repoMedia()` commits the file to `public/uploads`
(the image goes live with the next build). Write your own adapter by implementing
`upload({ key, contentType, data }, { store }) => { url }`.

`s3MediaFromEnv()` reads `ZAY_S3_BUCKET`, `ZAY_S3_ACCESS_KEY_ID`,
`ZAY_S3_SECRET_ACCESS_KEY`, and optionally `ZAY_S3_ENDPOINT`, `ZAY_S3_REGION`
(default `auto`), `ZAY_S3_PUBLIC_URL`, `ZAY_S3_PREFIX`, `ZAY_S3_PATH_STYLE=false`
(virtual-hosted style). Uploads pass through your server, so the platform's request
body limit applies (≈ 6 MB on Netlify/Vercel functions).

## Custom editors

```tsx
// client side
<ZayApp apiPath="/api/cms" editors={{ roadmap: RoadmapEditor }} />
// config: collections.roadmaps.editor = "roadmap"
```

An editor receives `{ slug, fields, locales, defaultLocale, localeNames, value, onChange }`
and shows up as a "Visual / Form" switch; saving stays with the panel.

## Security notes

- Every write needs the `x-zay-request: 1` header and a same-origin `Origin`.
- Slugs are `^[a-z0-9]+(-[a-z0-9]+)*$`; paths come from config, never from the request.
- GitHub writes never force-push. The local store cannot leave its root.
- No rate limiting or audit log of its own: rely on Git history and your host.

## Tests

`pnpm test:zay` — content engine on a temp directory, the HTTP handler (CSRF,
modes, errors), session sealing, and the GitHub store against an in-process
fake GitHub (one commit per save, deletes, binary blobs, race handling).

## Developing the package

```bash
pnpm install
pnpm test        # node:test suites
pnpm typecheck
pnpm build       # tsup → dist/ (index, next, ui) + schema.mjs + styles.css
pnpm dev         # rebuild on change
```

Consume it locally with a link (`pnpm add zay-static@link:../path/to/zay-static`, rebuild
with `pnpm dev`) or publish it (`npm publish`; `prepublishOnly` runs typecheck, tests, build).
`zay-static/ui` ships with a `"use client"` directive; `zay-static/schema` is plain ESM so Node
scripts (your build) can import the same field definitions the panel uses.
