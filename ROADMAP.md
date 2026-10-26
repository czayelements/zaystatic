# Roadmap and handoff

This file is both the plan and the briefing for whoever continues the work (human or coding agent).
Read **Handoff** first, then pick items from **Remaining work**.

> Status: **0.x, unreleased.** The on-disk content format is meant to stay stable; the public API may still change before 1.0.

---

## Handoff

### What this is
A Git-based content panel. Content is plain files in the user's repository; the panel edits them and
commits through the GitHub API (or writes to disk in development). The server is a framework-agnostic
`(Request) => Response` function; the UI is a React component. No database.

### Repository layout

```
src/
  schema/dsl.mjs, dsl.d.mts   Field helpers (str, text, markdown, image, int, bool, select, date, datetime,
                              relation(s), list, obj, block/blocks), normalize(), translatableFields(),
                              fieldsFromSample(), isEmptyValue(), validateDoc(). PLAIN ESM on purpose:
                              user build scripts import it as "zay-static/schema".
  core/types.ts               Config/Schema/Collection/Singleton/FileSet/Store types, defineX helpers,
                              resolveConfig(), HttpError.
  core/translation.ts         i18n setting: isI18n(), translatableOf() (explicit paths, markers, text-field default).
  core/content.ts             Content engine: list/read/write/delete entries, singletons, file sets,
                              validation on write, commitChanges() (no empty commits).
  core/serialize.ts           parse/serialize JSON and MDX (YAML frontmatter + body).
  core/store-fs.ts            Local store (cannot leave its root).
  core/store-github.ts        GitHub store (Contents API for reads, Git Data API for one-commit writes) and
                              githubClient() shared with the workflow.
  core/workflow.ts            Pull-request workflow: PullRequests (find/list/open/merge/close),
                              draftStore() (reads draft branch if a PR is open; first save creates branch+PR),
                              branch naming (zay/c/<collection>/<slug>, zay/s/<name>, zay/f/<set>/<file>).
  core/media.ts               Image pipeline: magic-byte sniffing, SVG screening, key naming, AWS SigV4 signer,
                              s3Media (upload/list/delete), repoMedia, s3MediaFromEnv.
  core/auth.ts                Mode resolution (local/github/unconfigured), sealed session cookie (AES-256-GCM),
                              GitHub OAuth helpers.
  core/api.ts                 The HTTP handler: routing, auth gate, CSRF, error mapping.
  next/index.ts, node/index.ts  Thin adapters (Next.js route handlers; Node http/Express).
  ui/                         React panel: app.tsx (shell, sidebar areas), views.tsx (screens), form.tsx
                              (field editors, lists/blocks with dnd-kit), parts.tsx, media.tsx, modal.tsx,
                              validation.tsx, context.tsx (router, toasts, guards), api.ts, i18n.ts + locales/,
                              zay.css (all classes `zs-` prefixed, CSS variables `--zs-*`).
test/                         node:test suites run with tsx (no network). fake-github.ts is an in-process GitHub.
scripts/                      clean + copy-assets (build helpers).
```

### Commands
```bash
pnpm install
pnpm test        # node:test via tsx; must stay green (54 tests at time of writing)
pnpm typecheck
pnpm build       # tsup -> dist/ (+ schema.mjs, styles.css; "use client" is prepended to dist/ui.js)
```

### Invariants. Do not break these
1. **On-disk format is the user's data.** `<slug>.<ext>`, or `<slug>.<locale>.<ext>` when the collection/singleton has `i18n` on. Non-default locale files hold
   only the translated fields (`i18n.fields`, else `i18n: "translate"` markers, else text fields); empty translations are deleted, never written. MDX = YAML frontmatter + body.
2. **Translations are position-aligned.** Lists and blocks in translation files line up by index with the default
   language. The UI locks structure in translation tabs and mirrors default-language add/remove/move/duplicate
   (`applyListOp` in `ui/form.tsx`, `ListOpProvider`).
3. **Blocks are stored as `{ _type, ...fields }`.** `_type` alone is not content (`isEmptyValue` ignores it).
4. **Server is the authority.** `validateDoc` runs on write (422 + per-language `issues`); the panel runs the same
   function for instant feedback. `required` applies to the default language only.
5. **Security.** Writes need `x-zay-request: 1` and a same-origin `Origin`; paths come from the schema/slug regex, never
   from the request; media keys must match `SAFE_KEY`; uploads are checked by magic bytes; production without `ZAY_*`
   env stays closed (never falls back to local files); GitHub writes never force-push.
6. **Server code stays framework-agnostic.** Do not import Next/React from `src/core`, `src/next`, `src/node` (except types).
7. **English only** in code, comments, errors, docs. UI strings go through `ui/locales/*.ts` (add a key to `en.ts`;
   every bundled language must define all keys, enforced by the i18n test).

### How the czay.dev project consumes this package
The package lives at `~/Documents/projects/zay-static` (own git repo). The czay.dev site (`~/Documents/czaydev`,
branch `feat/zay-static-package`) installs it as `"zay-static": "file:../projects/zay-static"` (a copy, because Turbopack
cannot resolve a symlink outside the project root). After changing the package run `pnpm zay:sync` in the site (builds the
package and reinstalls). The site's `zay.config.ts` holds settings, `zay.schema.ts` the content model (fields are
defined in `scripts/content/schema.mjs` because the site build reads the same definitions).
**Deploy blocker:** Netlify cannot see the `file:` path. Before merging that branch, publish the package (npm or a GitHub
repo) and change the dependency spec. `main` of the site still has the older in-repo copy and deploys fine.

### Verified vs. not verified (be honest in reviews)
- Verified by automated tests: content engine, validation, HTTP handler (CSRF, modes), session sealing, GitHub store and the
  whole pull-request workflow against `test/fake-github.ts`, S3 signer (AWS test vector) and list/delete against a fake
  server, uploads, Node adapter, i18n parity.
- Verified by hand in a real browser (headless Chrome, production build, local mode): drag and drop, save, translation tabs,
  validation messages, image upload, media library (list/pick/delete), blocks, sidebar areas.
- **Never run against the real services:** GitHub OAuth sign-in (needs an OAuth App), real GitHub writes, a real S3/R2 bucket,
  a real pull-request round trip, Netlify deploy previews. Treat these as unverified until someone does.
- The draft/PR **UI** (draft chip, Publish/Discard, Review page, "Save draft" label) compiles and is covered indirectly by API
  tests, but was **not** exercised in a browser with a draft present (local mode has no workflow).

---

## Shipped

**Content model**: schema in code (`defineSchema`, `defineCollection`, `defineSingleton`, `defineFileSet`); settings and schema in
separate files; field types (text, long text, markdown, image, number, boolean, select, date, datetime, relation(s), object, list,
blocks); collections and singletons (translation is a per-collection/per-singleton `i18n: { enabled, fields }` setting, not a layout), file sets; shared `normalize`/`validateDoc`.

**Validation**: `required`, `minLength`, `maxLength`, `pattern` (string or `[regex, message]`), `min`, `max`, `minItems`, `maxItems`.
Server rejects with 422 + issues; panel shows messages under fields, marks tabs and collapsed rows, blocks saving.

**Localisation of content**: per-collection / per-singleton `i18n` setting, one file per language, language tabs, source text under every translatable field, copy from default,
structure mirrored into translations.

**Media**: paste a link or upload (picker, drop, paste) with preview; S3-compatible adapter with built-in SigV4 (upload, list,
delete) or repo adapter; **media library** page + picker modal in every image field; magic-byte checks, size limit, SVG opt-in.

**Publishing**: local files (dev) and GitHub (one commit per save, fast-forward only, no empty commits). **Optional
pull-request workflow** (`workflow: "pull-request"`): draft branch + PR per entry, reads show the draft, Review page, Publish
(merge) / Discard (close), preview links (`previewUrl` template), draft chips in lists.

**Panel**: drag-and-drop lists/blocks, field search, ⌘S, unsaved-changes guard, light/dark, mobile layout, list sorting.
**Visual page builder** (`createBlockBuilder`): site-rendered previews on a canvas, drag-from-palette and click-to-add, per-block settings, translation-aware (structure locked outside the default language). **Extensibility**: custom editors (several per collection/singleton, with a view switcher, language-aware props) and per-field widgets, both registered by name in `<ZayApp editors widgets>`; the panel's parts (`PanelForm`, `ImageInput`, `MediaLibrary`, `useZay`) are exported for reuse. Sidebar areas **Content / Media / Review** as tabs; Content shows user-defined groups, and ungrouped items fall
into automatic Collections / Singletons / File sets sections; kind icons on every item.

**Panel language management**: the package owns the panel languages (`en`, `tr`); language picker in the sidebar (choice remembered), opt-in browser-language detection, and per-language labels anywhere in the schema (resolved server-side via `?lang=`); projects cannot add or override panel strings.

**Runtime**: `(Request) => Response` handler; adapters for Next.js and Node/Express; recipes for Hono, SvelteKit, Astro, Workers.

---

## Remaining work

Ordered by value. Each item says where to start and what "done" means.

### A. Verify what was never run against real services (do first)
1. **Real GitHub round trip.** Create a throwaway repo + OAuth App, set `ZAY_*`, sign in, save an entry, confirm the commit author
   is the signed-in user, confirm a stale save is rejected (push to the branch in between). *Done when* documented in a short
   "manual QA" section and any surprises are fixed in `store-github.ts`/`auth.ts`.
2. **Pull-request workflow in the browser.** Run with the fake GitHub (see `test/fake-github.ts`; expose it as a small dev
   script, e.g. `pnpm dev:fake-github`, plus a demo config) and drive the UI: save -> chip appears -> Publish/Discard -> Review
   page -> sidebar badge. Add a browser test (see D) or at least a documented manual script. Then repeat against real GitHub.
3. **S3/R2.** Upload, list, delete against a real bucket (R2 is what czay.dev uses). Check path-style vs virtual-hosted,
   `region: "auto"`, public URL, `Cache-Control`.

### B. Features
1. **Draft workflow gaps**
   - Entries that exist only as drafts show only their slug in lists; read the title from the draft branch.
   - Deleting an entry in PR mode commits the deletion to the draft branch; make this explicit in the UI ("deletion pending").
   - Media uploads with `repoMedia` commit directly to the base branch even in PR mode; either route them through the draft
     branch of the entry being edited or document it prominently.
   - Merge conflicts: surface a "resolve on GitHub" state per draft in Review (today: a 409 toast on publish).
   - Optional: `labels`, reviewers, auto-delete branch toggle, per-collection opt-in to the workflow.
2. **Media library gaps**: S3 listing is capped at 1000 objects (newest first by `LastModified`); add real continuation-token
   paging. Show "used in" (scan content for the URL) and warn before deleting a used file. Folders/tags, bulk upload progress,
   image dimensions, alt-text storage.
3. **Preview**: live preview of the rendered page (iframe against a preview URL, scroll-sync, per-collection URL template).
   The pull-request workflow already yields deploy-preview URLs; start there.
4. **Block builder follow-ups**: inline editing on the canvas (type straight into a preview), nested blocks / columns, undo/redo, keyboard shortcuts (delete, duplicate, arrows), responsive preview widths (phone / tablet / desktop), block templates and a "save as reusable block", drag between pages. Not yet tried in a browser at phone width.
5. **Rich text**: opt-in WYSIWYG for markdown with a lossless round trip, MDX component insertion.
5. **Search and integrity**: content-wide search; broken-reference and "used in" warnings for relations and images.
6. **Roles and permissions**: editor / publisher / admin; per-collection access; `ZAY_ALLOWED_USERS` becomes a map or a callback.
7. **History and revert** per entry from Git; scheduled publishing; webhooks / a "publish" button for hosts that do not rebuild on push.
8. **Other providers**: GitLab, Bitbucket, Gitea behind the `Store` interface (`src/core/types.ts`); other auth (SSO, passkeys)
   behind the session interface in `core/auth.ts`.
9. **Conflict UI**: when the repository changed under an open editor (today: a toast with the server message).
10. **Autosave of local drafts** (browser storage) and undo/redo inside the form.

### C. Developer experience
1. **Generate TypeScript types and a typed reader** from the schema (the biggest ergonomic win for users).
2. **Server-side custom validators** (needs a serialisable contract); a documented widget gallery (colour, date range, map point, tags) as optional add-on packages.
3. **Schema migration helper** (rename a field across all files, keeping translations aligned).
4. **Presigned uploads** straight from the browser to S3 to bypass platform body limits (needs bucket CORS docs).
5. **Image pipeline hooks** (resize/convert) and alt-text fields.
6. **Docs site** with per-framework recipes; **starter templates** (Next.js, Astro, SvelteKit).
7. **Non-React UI entry** (web component) so the panel can mount without React.
8. Per-field `description` vs `hint`, `placeholder`, `readOnly`, conditional fields (`showIf`), unique-value validation.

### D. Quality
1. **Browser-level tests** for the panel (Playwright against the fake GitHub or local mode): drag and drop, translation tabs,
   upload, validation, library, draft flow. Scratch CDP scripts used during development are not in the repo; rebuild them as proper tests.
2. **Accessibility audit**: keyboard drag and drop works through dnd-kit; do a screen-reader pass, focus management in modals, contrast check.
3. **More panel languages** (see below), including right-to-left styles for Arabic/Hebrew. Also: localise server error messages (they are English only today), date/number formatting by language, plural-aware strings.
4. **Performance**: large collections (hundreds of entries) call the store once per entry on list; add a cached index or a
   server-side summary file option. Big forms re-render the whole tree on each keystroke; memoise field rows.

### E. Release checklist
- Pick a licence and add `LICENSE`; fill `package.json` (author, repository, bugs, homepage, `files`, `sideEffects`).
- Set up CI (typecheck, test, build) and a security contact; enable GitHub private vulnerability reporting.
- `npm publish --provenance`; tag 0.1.0; write the first real CHANGELOG entry.
- Then switch the czay.dev site from `file:` to the published version and merge `feat/zay-static-package`.

---

## Known limitations
- The panel UI is React-only (the server is not).
- Uploads pass through your server (platform body limits, about 6 MB on Netlify/Vercel).
- GitHub only; one allow-list, no roles.
- No rendered preview; markdown is edited as raw text.
- Concurrent editing is last-writer-wins at the file level (a stale commit is rejected only if the branch moved between the read and the commit).
- The pull-request workflow needs GitHub mode; local mode always writes directly.

## Panel languages

The panel's wording belongs to the package. Projects choose among the shipped languages (`language`, plus the sidebar picker and
opt-in `autoDetectLanguage`); they cannot add languages or override strings. Shipped: **English** (`en`, the source and the fallback
for any missing key) and **Turkish** (`tr`). Schema labels are the project's own and may be per-language maps.

Contributing a language to the package: copy `src/ui/locales/en.ts` to `locales/<code>.ts` and translate the values (the type
checker flags missing keys), register it in `src/ui/i18n.ts` **and** in `src/core/languages.ts` (`PANEL_LANGUAGES`). Tests keep
both lists, and every dictionary, in sync with English.
Planned: de, es, fr, pt-BR, ja, zh-CN, ar (needs right-to-left styles).
