# zay-static

A small, Git-based content panel. Your content stays as plain files in your
repository; zay-static gives editors a polished panel to change it and commits
straight to your branch. No database, no hosted service, no lock-in: stop using
it tomorrow and your content is still just JSON and Markdown.

- **Schema in code.** One field definition drives both the panel's forms and the
  reader that builds your site, so what the panel writes and what the site reads
  cannot drift apart.
- **Real localisation.** One file per language (`post.en.mdx`, `post.de.mdx`),
  language tabs, the source text shown under every field you translate.
- **Drag and drop** for every list, plus **typed blocks** for page-builder style content.
- **Validation** rules (required, length, pattern, min/max, item counts) enforced on the server and shown in the panel.
- **Media library** to browse, reuse and delete uploads.
- **Optional draft workflow:** saves can open pull requests, with a Review page to publish or discard.
- **Images:** paste a link or upload, to any S3-compatible bucket (S3, R2, MinIO,
  B2, Spaces …) or straight into your repo.
- **Git is the backend.** Each save is one commit, made with the editor's own GitHub
  identity, fast-forward only. Your host rebuilds on push as usual.
- **Framework-agnostic server.** The API is a plain `(Request) => Response`
  function; adapters are a few lines. The UI is a React component.

> Status: 0.x. The content format and the public API may still change before 1.0.

## How it works

```
 editor ──► panel (React) ──► API (Request → Response) ──► store ──► your repository
                                  │                          ├─ local   files on disk (development)
                                  └─ media adapter           └─ github  Git Data API, one commit per save
                                       ├─ S3-compatible bucket
                                       └─ repository (public/uploads)
```

Your site reads the same files at build time with whatever it likes; the field
definitions are plain ESM (`zay-static/schema`) so a Node build script can import
the very same schema the panel uses.

## Install

```bash
npm install zay-static        # or pnpm add / yarn add
```

Requires Node 20+. The UI needs React 19 (peer dependency).

## Quick start (Next.js)

zay-static is configured by two files in your project:

- **`zay.schema.ts`**: the *content model* (what kinds of content exist and their fields).
- **`zay.config.ts`**: the *settings* (name, locales, paths, repository, image storage).

### 1. Schema

```ts
// zay.schema.ts
import { defineSchema, defineCollection, defineSingleton } from "zay-static";
import { str, image, markdown, select, blocks, block } from "zay-static/schema";

export default defineSchema({
  groups: [{ id: "content", label: "Content" }, { id: "site", label: "Site" }],
  collections: {
    posts: defineCollection({
      label: "Posts", group: "content",
      dir: "content/posts", layout: "locales", ext: "mdx", identifier: "title",
      summary: "{{title}} · {{status}}",
      sort: { field: "publishedAt", order: "desc" },
      fields: {
        title: str("Title", { i18n: "translate" }),
        status: select("Status", [{ label: "Draft", value: "draft" }, { label: "Live", value: "live" }], "draft"),
        cover: image("Cover"),
        body: markdown("Body", { i18n: "translate" }),
      },
    }),
  },
  singletons: {
    home: defineSingleton({
      label: "Home page", group: "site", file: "content/home.json",
      fields: {
        sections: blocks("Sections", {
          hero: block("Hero", { title: str("Title", { i18n: "translate" }), image: image("Image") }),
          text: block("Text", { body: markdown("Body", { i18n: "translate" }) }),
        }),
      },
    }),
  },
});
```

### 2. Settings

```ts
// zay.config.ts
import { defineConfig, repoMedia, s3MediaFromEnv } from "zay-static";
import schema from "./zay.schema";

export default defineConfig({
  name: "My site",
  locales: ["en", "de"],
  defaultLocale: "en",
  basePath: "/cms",        // where the panel page lives
  apiPath: "/api/cms",     // where the API lives
  repo: { owner: "me", name: "my-site", branch: "main" },
  media: { adapter: s3MediaFromEnv() ?? repoMedia() },
  schema,
});
```

(One file works too: pass `collections`, `singletons`, `fileSets` and `groups` straight to
`defineConfig`; top-level entries win over `schema`.)

### 3. API route

```ts
// app/api/cms/[...path]/route.ts
import { createNextHandlers } from "zay-static/next";
import config from "@/zay.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST, PUT, DELETE } = createNextHandlers(config);
```

### 4. Panel page

```tsx
// app/cms/layout.tsx  (own root layout: no site chrome)
import "zay-static/styles.css";
export default ({ children }: { children: React.ReactNode }) => (
  <html lang="en"><body style={{ margin: 0 }}>{children}</body></html>
);

// app/cms/[[...path]]/page.tsx
import { Panel } from "./panel";
export default () => <Panel />;

// app/cms/panel.tsx
"use client";
import { ZayApp } from "zay-static/ui";
export const Panel = () => <ZayApp apiPath="/api/cms" />;
```

If you use locale-routing middleware, exclude the panel path from its matcher.

### 5. Run it

`next dev` → open `/cms`. In development the panel writes to your local files, no
sign-in. For production, set up GitHub sign-in (see [Authentication](#authentication)).

## Other frameworks

The server side is `createHandler(config): (request: Request) => Promise<Response>`, a
standard fetch-style function, so any runtime that speaks Web `Request`/`Response` can host it:

```ts
import { createHandler } from "zay-static";
const handle = createHandler(config);

// Hono
app.all("/api/cms/*", (c) => handle(c.req.raw));
// SvelteKit  (src/routes/api/cms/[...path]/+server.ts)
export const GET = ({ request }) => handle(request); // …POST, PUT, DELETE the same way
// Astro / Remix / React Router: call handle(request) from the route's loader/action
// Cloudflare Workers / Deno / Bun: handle(request)
```

For Node's `http` and Express there is an adapter:

```ts
import { createNodeHandler } from "zay-static/node";
app.use("/api/cms", createNodeHandler(config));            // Express
http.createServer(createNodeHandler(config)).listen(3000);  // plain Node
```

The UI (`zay-static/ui`) is a React component and runs in any React 19 app: Next.js,
Vite, React Router/Remix, Astro islands. It only needs the API path and the stylesheet
(`zay-static/styles.css`). The server needs a Node-compatible runtime for `node:crypto`
(sessions, request signing); fs mode needs a real file system.

## Content model

Three **content kinds**, each with a definition helper:

| kind | helper | stored as | typical use |
| --- | --- | --- | --- |
| collection | `defineCollection` | one file per entry, in a folder | posts, products, team members |
| singleton | `defineSingleton` | one file | site settings, a home page, navigation |
| file set | `defineFileSet` | the same JSON shape in every language | UI strings (`messages/<locale>/*.json`) |

A collection's `layout`:

| `layout` | files | notes |
| --- | --- | --- |
| `plain` | `<slug>.json` | one file, one entry |
| `locales` | `<slug>.<locale>.json` or `.mdx` | default locale carries all fields; the others only fields marked `i18n: "translate"`. Empty translations are deleted, never written. |

`mdx` entries are YAML frontmatter plus the body (the single `markdown` field). A file set
needs no schema: its form is derived from the default-language file.

### Field types

Every field has a type, and every type has its own editor.

| type | helper | editor | stored as |
| --- | --- | --- | --- |
| text | `str` | single-line input | string |
| long text | `text` | auto-growing textarea | string |
| markdown | `markdown` | monospace editor (raw, lossless) | string |
| image | `image` | link input + preview + upload (picker, drop, paste) | string (URL or path) |
| number | `int` | number input | number or null |
| boolean | `bool` | switch | boolean |
| select | `select` | segmented control (up to 4 options) or dropdown | string |
| date, datetime | `date`, `datetime` | native pickers | `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm` |
| relation(s) | `relation`, `relations` | dropdown or chips, fed by another collection | slug(s) |
| object | `obj` | group (`{ inline: true }`: one row) | object |
| list | `list` | **drag-and-drop**, collapsible, duplicate, delete | array |
| blocks | `blocks` + `block` | **drag-and-drop** list of *typed* items; pick a type to add | `[{ _type, ...fields }]` |

Options common to all: `hint`, `default`, `i18n: "translate"`. Lists, objects and blocks take
`summary: "{{fields.title}}"` for the collapsed row title. Structural changes to a list or blocks
field in the default language (add, remove, move, duplicate) are mirrored into the translations,
which stay position-aligned.

`normalize(field, raw)` (from `zay-static/schema`) fills defaults the same way the panel does, so
your build can read files that only contain the fields someone filled in.

## Draft workflow (pull requests)

By default a save is a commit to your configured branch. Set `workflow` and every save goes to a
draft branch instead and opens a pull request; a **Review** tab lists the drafts to publish (merge) or discard:

```ts
defineConfig({
  // …
  workflow: {
    mode: "pull-request",
    previewUrl: "https://deploy-preview-{pr}--my-site.netlify.app", // optional: link to a rendered preview
    mergeMethod: "squash", // or "merge" | "rebase"
    branchPrefix: "zay/",
  },
});
```

One branch per editing unit (`zay/c/<collection>/<slug>`, `zay/s/<singleton>`, `zay/f/<set>/<file>`), so unrelated
edits never block each other. While a draft is open the panel shows the draft; unchanged saves add nothing. Needs GitHub
mode (local mode always writes directly). Media uploads with the repo adapter commit directly (see ROADMAP).

## Validation

```ts
str("Slug", { required: true, minLength: 3, maxLength: 60, pattern: ["^[a-z0-9-]+$", "Lowercase letters, numbers and dashes"] })
int("Year", { min: 1990, max: 2100 })
list("Tags", str("Tag"), { minItems: 1, maxItems: 5 })
```

Rules are checked by the same function (`validateDoc`) on the server and in the panel. Translations may be partial:
`required` applies to the default language only, other rules apply to whatever is filled in.

## Panel language

The panel's own wording (buttons, messages, empty states) is **owned by the package**: it ships a fixed set of languages
(currently **English** and **Turkish**), and a project cannot add languages or override strings. That keeps the panel
consistent for every editor and every install; new languages arrive through package updates.

- **Choosing.** `language` in the settings is the default (`"en"` if omitted). The sidebar shows a **language picker** (named in
  each language); the editor's choice is remembered in their browser and wins over the default. With `autoDetectLanguage: true`
  the panel starts in the browser's language when the package ships it.
- **Your schema's own labels** (collection and group names, field labels, hints, option labels, block names, validation messages)
  are *your* content model, not panel wording. They may be a plain string or a map per language; the server resolves them to
  the language the panel is in, so switching language relabels the whole panel:

```ts
defineConfig({
  language: "tr",           // default panel language: "en" | "tr" (omit for English)
  autoDetectLanguage: true, // optional
  schema: defineSchema({
    collections: {
      posts: defineCollection({
        label: { en: "Posts", tr: "Yazılar" },
        fields: { title: str({ en: "Title", tr: "Başlık" }, { hint: { en: "Shown in lists", tr: "Listelerde görünür" } }) },
        // …
      }),
    },
  }),
});
```

Lookup order for a label: exact language (`pt-BR`), then its base (`pt`), then English, then the first entry. A plain string is
used in every language.

Content translation (one file per language for your *content*) is a separate feature, see below. To add a panel language to
the package, see [ROADMAP.md](ROADMAP.md#panel-languages).

## Localisation

`locales` and `defaultLocale` in the settings; `layout: "locales"` on a collection. Each
language tab shows the default-language text under every translatable field, and "Copy from
default" pre-fills a tab. Missing translations are simply absent files, which your site can
treat as "not translated yet".

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
    maxBytes: 5 * 1024 * 1024, // default 5 MB
    accept: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"], // add "image/svg+xml" deliberately
  },
});
```

Use `image("Cover")` in the schema; the panel gets a **Media** tab (browse, search, reuse, delete) and a "Library" picker in every image field when the adapter supports listing (`s3Media` and `repoMedia` do). Without `media` the field is a link input with a preview.
Uploads are validated on the server (size, real file type from the bytes, unsafe SVG) and stored
as `<prefix>YYYY/MM/<slug>-<random>.<ext>` with a one-year immutable `Cache-Control`.
`s3Media` signs requests itself (AWS SigV4, no AWS SDK); `repoMedia()` commits the file to
`public/uploads`. To use another store, implement `upload({ key, contentType, data }, { store }) => { url }`.

`s3MediaFromEnv()` reads `ZAY_S3_BUCKET`, `ZAY_S3_ACCESS_KEY_ID`, `ZAY_S3_SECRET_ACCESS_KEY` and optionally
`ZAY_S3_ENDPOINT`, `ZAY_S3_REGION` (default `auto`), `ZAY_S3_PUBLIC_URL`, `ZAY_S3_PREFIX`,
`ZAY_S3_PATH_STYLE=false` (virtual-hosted style). Uploads pass through your server, so the
platform's request-body limit applies (about 6 MB on Netlify and Vercel functions).

## Authentication

| variable | meaning |
| --- | --- |
| `ZAY_MODE` | `local` (disk, no sign-in: your own machine only) or `github`. Unset: `local` in development, `github` in production. |
| `ZAY_GITHUB_CLIENT_ID`, `ZAY_GITHUB_CLIENT_SECRET` | a GitHub OAuth App; callback URL `https://<host><apiPath>/auth/callback` |
| `ZAY_SESSION_SECRET` | long random string; seals the session cookie |
| `ZAY_ALLOWED_USERS` | comma-separated GitHub logins allowed in (they also need push access to the repo) |
| `ZAY_PUBLIC_URL` | optional; the public origin when a proxy hides it |

The signed-in user's own token (scope `repo`) makes the commits, so history shows who changed
what. If the variables are missing in production the panel stays closed: it never falls back to
local files.

## Custom editors

A collection can name a custom React editor, shown next to the generic form as a "Visual / Form" switch:

```tsx
<ZayApp apiPath="/api/cms" editors={{ roadmap: RoadmapEditor }} />
// schema: defineCollection({ …, editor: "roadmap" })
```

An editor receives `{ slug, fields, locales, defaultLocale, localeNames, value, onChange }`; saving
stays with the panel.

## Security

- Every write needs the `x-zay-request: 1` header and a same-origin `Origin` (CSRF).
- Sessions are AES-256-GCM sealed `HttpOnly` cookies; the GitHub token never reaches the browser.
- Slugs match `^[a-z0-9]+(-[a-z0-9]+)*$`; file paths come from your schema, never from the request.
- GitHub writes never force-push; a concurrent push is reported, not overwritten. The local store cannot leave its root.
- Uploads are checked by magic bytes; SVG is opt-in and screened for scripts.
- No rate limiting or audit log of its own: rely on Git history and your host.

Please report vulnerabilities privately (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## HTTP API

All paths are relative to `apiPath`; bodies are JSON unless noted.

| method, path | purpose |
| --- | --- |
| `GET /session` | mode, user, repo, media limits |
| `GET /schema` | the resolved content model |
| `GET /collections/:name` | list entries |
| `GET /collections/:name/:slug` | read an entry (one document per language) |
| `POST /collections/:name/:slug` | create `{ docs }` |
| `PUT /collections/:name/:slug` | update `{ docs }` |
| `DELETE /collections/:name/:slug` | delete all language files |
| `GET, PUT /singletons/:name` | read / write `{ doc }` |
| `GET /filesets/:name[/:file]`, `PUT /filesets/:name/:file` | list, read, write `{ docs }` |
| `POST /media` | multipart upload (`file`) → `{ url }` |
| `GET /auth/login`, `GET /auth/callback`, `POST /auth/logout` | GitHub sign-in |

## Package entry points

| import | contents |
| --- | --- |
| `zay-static` | `defineConfig`, `defineSchema`, `defineCollection`, `defineSingleton`, `defineFileSet`, `createHandler`, `resolveConfig`, `s3Media`, `s3MediaFromEnv`, `repoMedia`, types |
| `zay-static/schema` | field helpers (`str`, `text`, `markdown`, `image`, `int`, `bool`, `select`, `date`, `datetime`, `relation`, `relations`, `list`, `obj`, `block`, `blocks`), `normalize`, `translatableFields`, `isEmptyValue` |
| `zay-static/next` | `createNextHandlers` |
| `zay-static/node` | `createNodeHandler` |
| `zay-static/ui` | `ZayApp`, `EditorProps` |
| `zay-static/styles.css` | the panel's stylesheet (every class is `zs-` prefixed; override `--zs-*` variables to theme) |

## Limitations

See [ROADMAP.md](ROADMAP.md) for what is planned.

- The panel UI is React-only (the server is not).
- Uploads go through your server (platform body limits apply); there is no media library to browse earlier uploads.
- No draft/review workflow: a save is a commit to the configured branch.
- No built-in preview of the rendered site.
- Markdown is edited as raw text (lossless; no rich-text mode).

## Development

```bash
pnpm install
pnpm test        # node:test suites
pnpm typecheck
pnpm build       # tsup → dist/ plus schema.mjs and styles.css
pnpm dev         # rebuild on change
```

The tests cover the content engine, the HTTP handler (CSRF, modes, errors), session sealing, the
GitHub store against an in-process fake GitHub, the S3 signer (checked against AWS's published test
vector), uploads, and the Node adapter. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Not chosen yet. Add a `LICENSE` file before publishing.
