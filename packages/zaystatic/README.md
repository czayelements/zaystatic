# zaystatic

> [!WARNING]
> **Under development.** zaystatic is an early alpha (`0.1.0-alpha`). It is not production-ready: the public API may change without notice, and the GitHub sign-in, the pull-request workflow and the S3/R2 storage have so far been tested against fake servers and local setups, not yet against real services. Try it, break it and [open an issue](https://github.com/czayelements/zaystatic/issues), but do not put it in front of a site you cannot afford to break.

A small, Git-based content panel. Your content stays as plain files in your
repository; zaystatic gives editors a polished panel to change it and commits
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
definitions are plain ESM (`@czayelements/zaystatic/schema`) so a Node build script can import
the very same schema the panel uses.

## Install

```bash
npm install @czayelements/zaystatic@alpha        # or pnpm add / yarn add
```

Requires Node 20+. The UI needs React 19 (peer dependency).

## Quick start (Next.js)

zaystatic is configured by two files in your project:

- **`zay.schema.ts`**: the *content model* (what kinds of content exist and their fields).
- **`zay.config.ts`**: the *settings* (name, locales, paths, repository, image storage).

### 1. Schema

```ts
// zay.schema.ts
import { defineSchema, defineCollection, defineSingleton } from "@czayelements/zaystatic";
import { str, image, markdown, select, blocks, block } from "@czayelements/zaystatic/schema";

export default defineSchema({
  groups: [{ id: "content", label: "Content" }, { id: "site", label: "Site" }],
  collections: {
    posts: defineCollection({
      label: "Posts", group: "content",
      dir: "content/posts", ext: "mdx", identifier: "title",
      i18n: { enabled: true, fields: ["title", "body"] }, // translate these; everything else stays in the default language
      summary: "{{title}} · {{status}}",
      sort: { field: "publishedAt", order: "desc" },
      fields: {
        title: str("Title"),
        status: select("Status", [{ label: "Draft", value: "draft" }, { label: "Live", value: "live" }], "draft"),
        cover: image("Cover"),
        body: markdown("Body"),
      },
    }),
  },
  singletons: {
    home: defineSingleton({
      label: "Home page", group: "site", file: "content/home.json",
      i18n: { fields: ["sections.title", "sections.body"] }, // dotted paths reach into blocks, lists and objects
      fields: {
        sections: blocks("Sections", {
          hero: block("Hero", { title: str("Title"), image: image("Image") }),
          text: block("Text", { body: markdown("Body") }),
        }),
      },
    }),
  },
});
```

### 2. Settings

```ts
// zay.config.ts
import { defineConfig, repoMedia, s3MediaFromEnv } from "@czayelements/zaystatic";
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
import { createNextHandlers } from "@czayelements/zaystatic/next";
import config from "@/zay.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST, PUT, DELETE } = createNextHandlers(config);
```

### 4. Panel page

```tsx
// app/cms/layout.tsx  (own root layout: no site chrome)
import "@czayelements/zaystatic/styles.css";
export default ({ children }: { children: React.ReactNode }) => (
  <html lang="en" suppressHydrationWarning><body style={{ margin: 0 }}>{children}</body></html>
);

// app/cms/[[...path]]/page.tsx
import { Panel } from "./panel";
export default () => <Panel />;

// app/cms/panel.tsx
"use client";
import { ZayApp } from "@czayelements/zaystatic/ui";
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
import { createHandler } from "@czayelements/zaystatic";
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
import { createNodeHandler } from "@czayelements/zaystatic/node";
app.use("/api/cms", createNodeHandler(config));            // Express
http.createServer(createNodeHandler(config)).listen(3000);  // plain Node
```

The UI (`@czayelements/zaystatic/ui`) is a React component and runs in any React 19 app: Next.js,
Vite, React Router/Remix, Astro islands. It only needs the API path and the stylesheet
(`@czayelements/zaystatic/styles.css`). The server needs a Node-compatible runtime for `node:crypto`
(sessions, request signing); fs mode needs a real file system.

## Content model

Three **content kinds**, each with a definition helper:

| kind | helper | stored as | typical use |
| --- | --- | --- | --- |
| collection | `defineCollection` | one file per entry (per language when `i18n` is on), in a folder | posts, products, team members |
| singleton | `defineSingleton` | one file (per language when `i18n` is on) | site settings, a home page, navigation |
| file set | `defineFileSet` | the same JSON shape in every language | UI strings (`messages/<locale>/*.json`) |

### Translating content (`i18n`)

Content translation is a setting of each collection **and each singleton**, independent of the file format:

```ts
i18n: false                                              // default: one file, one language (<slug>.json)
i18n: true                                               // translate the text fields
i18n: { enabled: true, fields: ["title", "body", "gallery.alt"] }   // translate exactly these
```

When it is on, every entry is stored as one file per language (`<slug>.<locale>.json` or `.mdx`; a singleton becomes
`<name>.<locale>.json`). The default language's file carries every field; the other languages carry only the **chosen
fields**, and the panel shows only those when you switch language tabs. A dotted path reaches into an object, a list of
objects, or every block type (`"gallery.alt"` translates only `alt` of each gallery item). Without a `fields` list the
per-field shorthand `i18n: "translate"` is used, and without that every top-level text field. Unknown field names in `fields`
throw at startup. Empty translations are deleted, never written. `ext` (`"json"` default, or `"mdx"`) works with or without
translation. (`layout: "locales"` from earlier versions still works as `i18n: true`.)

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

Options common to all: `hint`, `default`, `required` and the other [validation](#validation) rules, and the shorthand `i18n: "translate"` (see above). Lists, objects and blocks take
`summary: "{{fields.title}}"` for the collapsed row title. Structural changes to a list or blocks
field in the default language (add, remove, move, duplicate) are mirrored into the translations,
which stay position-aligned.

`normalize(field, raw)` (from `@czayelements/zaystatic/schema`) fills defaults the same way the panel does, so
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

## Reading your content

The panel writes files; the **reader** returns the same documents to your site's code, completed with the schema's defaults and language-aware:

```ts
import { createReader, createGitHubReader } from "@czayelements/zaystatic/reader";

const reader = createReader(config);                      // files of your project (or any checkout)
// or: content in ANOTHER repository, fetched through the GitHub API
const remote = createGitHubReader(config, { repo: "my-org/site-content", token: process.env.CONTENT_TOKEN!, pathPrefix: "apps/web" });

await reader.collections.posts.list();                                  // ["hello", "second-post"]
await reader.collections.posts.read("hello", { locale: "de" });         // translation over the default language
await reader.collections.posts.all();                                   // every entry
await reader.singletons.home.read();
await reader.fileSets.messages.read("nav", { locale: "de" });
```

For other languages the translation is overlaid on the default language's document (empty values fall back; lists and blocks line up by position); `{ fallback: false }` returns the translation alone. To keep content in a separate repository, set `repo` to it for the panel (with `pathPrefix` if the content is in a sub-folder) and read it with `createGitHubReader`; add a webhook on that repository to rebuild your site. See the [documentation](https://github.com/czayelements/zaystatic/blob/main/docs/content/docs/reading-content.mdx).

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
the package, see [ROADMAP.md](https://github.com/czayelements/zaystatic/blob/main/ROADMAP.md#panel-languages).

## Localisation

`locales` and `defaultLocale` in the settings; `i18n` on a collection or singleton. Each
language tab shows the default-language text under every translatable field, and "Copy from
default" pre-fills a tab. Missing translations are simply absent files, which your site can
treat as "not translated yet".

## Images

```ts
import { defineConfig, s3Media, s3MediaFromEnv, repoMedia } from "@czayelements/zaystatic";

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
| `ZAY_SESSION_SECRET` | long random string (at least 32 characters); seals the session cookie |
| `ZAY_ALLOWED_USERS` | comma-separated GitHub logins allowed in (they also need push access to the repo) |
| `ZAY_PUBLIC_URL` | optional; the public origin when a proxy hides it |
| `ZAY_BRANCH` | optional; read from and commit to this branch instead of `repo.branch` (try the panel on a test branch) |
| `ZAY_PATH_PREFIX` | optional; overrides `repo.pathPrefix` (the content folder inside the repository) |

The signed-in user's own token (scope `repo`) makes the commits, so history shows who changed
what. If the variables are missing in production the panel stays closed (its API answers 404; in a Next.js page use `if (!isPanelOpen(config)) notFound()` with `isPanelOpen` from `@czayelements/zaystatic/next`): it never falls back to
local files.

## Custom editors and widgets

The panel's standard form works for any schema, but your data may deserve a better view: a diagram, a page layout, a
board, a map. zaystatic lets **your site render the data however it wants** while the panel keeps saving, validation,
drafts, language tabs and image uploads. Two extension points, both plain React components registered by name:

```tsx
"use client";
import { ZayApp } from "@czayelements/zaystatic/ui";
import { RoadmapEditor } from "./roadmap-editor";
import { ColorWidget } from "./color-widget";

export const Panel = () => (
  <ZayApp apiPath="/api/cms" editors={{ roadmap: RoadmapEditor }} widgets={{ color: ColorWidget }} />
);
```

**Editors** replace the whole form with your own view of an entry. Attach one or several to any collection or singleton;
the panel adds a switcher (Form · your editors):

```ts
defineCollection({
  // …
  editors: [
    "roadmap",                                                        // shorthand: opens first
    { name: "board", label: { en: "Board", de: "Tafel" }, default: false, languages: "tabs" },
  ],
});
```

An editor receives `EditorProps`:

| prop | meaning |
| --- | --- |
| `value`, `onChange(next)` | the **active language's** document, and a setter. All you need for untranslated content. |
| `docs`, `setDocs(next)` | every language's document (for `languages: "self"`) |
| `kind`, `name`, `slug`, `isNew` | what is being edited (`slug` is undefined for singletons and unsaved entries) |
| `fields`, `i18nFields`, `activeFields` | the schema: all fields, the translated subset, and what applies to the active language |
| `translated`, `activeLocale`, `setActiveLocale`, `locales`, `defaultLocale`, `localeNames` | language state |
| `errors`, `showErrors` | validation messages by field path (`"items.0.title"`) for the active language |

With translated content the panel shows the language tabs above your editor and passes the active language's document
(`languages: "tabs"`, the default); use `languages: "self"` to get all documents and manage languages yourself.

Build your editor from the panel's own parts, all exported from `@czayelements/zaystatic/ui`:

- `PanelForm` — the schema-driven form (lists, blocks, drag and drop, validation) for any `fields`, so you can render
  *part* of a document your own way and hand the rest to the standard form;
- `ImageInput` and `MediaLibrary` — the upload / link / library picker;
- `useZay()` — the API client, the panel's `t` strings, `toast`, the current language;
- `LocaleTabs`, `Modal`, `Link`.

**Widgets** replace the control of a single field. Name one on the field, register it in `widgets`, and render the value your way:

```ts
colour: str("Colour", { widget: "color" })
```
```tsx
export function ColorWidget({ value, onChange, errors }: WidgetProps) {
  return <input type="color" value={String(value || "#000000")} onChange={(e) => onChange(e.target.value)} />;
}
```

A widget gets `field`, `value`, `onChange`, `path`, `errors`, and (in a translation tab) `reference` and `translating`. It works on
any field type, including lists and objects, and inside lists and blocks.

### A visual page builder, out of the box

For content made of `blocks` (landing pages, long articles with typed sections) the package ships a ready-made visual editor.
You supply only how each block *looks*; the canvas, the palette and the settings are built in:

```tsx
import { ZayApp, createBlockBuilder } from "@czayelements/zaystatic/ui";
import { HeroPreview, FeaturesPreview } from "./block-previews"; // your site's own components

const PageBuilder = createBlockBuilder({
  field: "sections",                                    // the blocks field it edits
  previews: { hero: HeroPreview, features: FeaturesPreview }, // block type -> how it looks on the canvas
  Frame: SitePageFrame,                                 // optional: your fonts, width, background around the page
});

<ZayApp apiPath="/api/cms" editors={{ page: PageBuilder }} />
```
```ts
defineSingleton({
  label: "Home page", file: "content/home.json",
  editors: [{ name: "page", label: "Builder", default: true }],
  i18n: { fields: ["sections.title", "sections.body"] },
  fields: {
    sections: blocks("Sections", {
      hero: block("Hero", { title: str("Title"), image: image("Image") }, { icon: "H", description: "Big headline" }),
      features: block("Features", { items: list("Items", str("Item")) }, { icon: "F" }),
    }),
  },
});
```

- **Centre, the page.** Every block is drawn by *your* preview component (`BlockPreviewProps`: `block` values, `type`, `locale`,
  `selected`), so editors see what visitors will. Types without a preview get a simple generic card. Click a block to select it;
  drag the handle to reorder; the toolbar moves, duplicates and deletes. Previews are pictures: clicks select, links do not fire.
- **Right, a toolbar.** *Blocks*: a palette of the schema's block types (`block(label, fields, { icon, description })`), drag a card onto the
  page (a line shows where it lands) or click it to add after the selected block. *Settings*: the selected block's fields, with
  validation, image uploads and the media library, as in the standard form.
- **Translations.** With translated content the page structure follows the default language (translations stay position-aligned): in
  other language tabs the palette and toolbar are locked, previews show the translated text over the default's, and the settings show
  only the fields chosen in `i18n.fields`. Structural changes in the default language are mirrored into every translation.
- **Your own variations.** `createBlockBuilder` is a normal editor, so you can wrap it, or write a different editor from scratch
  with the same parts (`PanelForm`, `ImageInput`, `MediaLibrary`, `useZay`).

Because editors run in your app they can import your site's own components, so what editors see is exactly what visitors see (czay.dev
does this for its roadmap diagrams: the editor draws the same diagram the public page does and lets you drag the boxes around).
Custom editors are loaded by your code, so keep heavy ones lazy (`next/dynamic`) to keep the rest of the panel light.

## Security

- Every write needs the `x-zay-request: 1` header and a same-origin `Origin` (CSRF).
- Sessions are AES-256-GCM sealed `HttpOnly` cookies; the GitHub token never reaches the browser.
- Slugs match `^[a-z0-9]+(-[a-z0-9]+)*$`; file paths come from your schema, never from the request.
- GitHub writes never force-push; a concurrent push is reported, not overwritten. The local store cannot leave its root.
- Uploads are checked by magic bytes; SVG is opt-in and screened for scripts.
- No rate limiting or audit log of its own: rely on Git history and your host.

Please report vulnerabilities privately (see [SECURITY.md](https://github.com/czayelements/zaystatic/blob/main/SECURITY.md)).

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
| `@czayelements/zaystatic` | `defineConfig`, `defineSchema`, `defineCollection`, `defineSingleton`, `defineFileSet`, `createHandler`, `resolveConfig`, `s3Media`, `s3MediaFromEnv`, `repoMedia`, types |
| `@czayelements/zaystatic/schema` | field helpers (`str`, `text`, `markdown`, `image`, `int`, `bool`, `select`, `date`, `datetime`, `relation`, `relations`, `list`, `obj`, `block`, `blocks`), `normalize`, `translatableFields`, `isEmptyValue` |
| `@czayelements/zaystatic/next` | `createNextHandlers` |
| `@czayelements/zaystatic/node` | `createNodeHandler` |
| `@czayelements/zaystatic/reader` | `createReader`, `createGitHubReader` |
| `@czayelements/zaystatic/ui` | `ZayApp`, `PanelForm`, `ImageInput`, `MediaLibrary`, `useZay`, `LocaleTabs`, `Modal`, `Link`, types `EditorProps`, `WidgetProps` |
| `@czayelements/zaystatic/styles.css` | the panel's stylesheet (every class is `zs-` prefixed; override `--zs-*` variables to theme) |

## Limitations

See [ROADMAP.md](https://github.com/czayelements/zaystatic/blob/main/ROADMAP.md) for what is planned.

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
vector), uploads, and the Node adapter. See [CONTRIBUTING.md](https://github.com/czayelements/zaystatic/blob/main/CONTRIBUTING.md).

## License

[MIT](https://github.com/czayelements/zaystatic/blob/main/LICENSE)
