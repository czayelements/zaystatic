# Roadmap

Where zay-static is today and where it is going. Items move between sections as they
land; the changelog records what shipped in each release.

> Status: **0.x**. The on-disk content format is meant to stay stable; the public API may still change before 1.0.

## Shipped

**Content model**
- Schema in code: `defineSchema`, `defineCollection`, `defineSingleton`, `defineFileSet`; settings and schema live in separate files (`zay.config.ts`, `zay.schema.ts`).
- Field types: text, long text, markdown, image, number, boolean, select, date, datetime, relation(s), object, list, **blocks** (typed items).
- Collections (`plain` or per-locale files), singletons, file sets (UI strings, form derived from the default-language file).
- `normalize` / `translatableFields` / `validateDoc` shared by the panel and your build (`zay-static/schema`, plain ESM).
- Validation rules: `required`, `minLength`, `maxLength`, `pattern` (+ message), `min`, `max`, `minItems`, `maxItems`. Enforced by the server (422 with per-language issues) and shown in the panel (field messages, marked tabs and collapsed rows, save blocked).

**Localisation of content**
- One file per language, language tabs, source text shown under each translatable field, "copy from default".
- List and block structure changes in the default language are mirrored into every translation.
- Empty translations are never written (and are deleted when emptied).

**Panel**
- Drag-and-drop lists and blocks, collapsible rows, duplicate/delete, field search for large forms.
- Image field: paste a link or upload (picker, drop, clipboard) with preview.
- ⌘S, unsaved-changes guard, toasts, light/dark, mobile layout, list sorting and search.
- Custom editors (plug-ins) shown next to the generic form.
- Panel UI is i18n-based: English by default, `tr` bundled, `language` and `translations` in the settings (see below).

**Storage and publishing**
- Local files (development) and GitHub (Git Data API: one commit per save, fast-forward only, no empty commits).
- Image uploads to any S3-compatible bucket (built-in SigV4, no AWS SDK) or into the repo; magic-byte type checks, size limit, SVG opt-in with screening.
- GitHub sign-in (OAuth), allow-list, AES-256-GCM sealed session, CSRF-guarded writes, closed by default in production.

**Runtime**
- Framework-agnostic `(Request) => Response` handler; adapters for Next.js and Node/Express; recipes for Hono, SvelteKit, Astro, Workers.
- 40 tests (content engine, HTTP, auth, GitHub store vs a fake GitHub, S3 signer vs AWS's test vector, uploads, validation, i18n).

## Next (in this order)

1. **Media library.** Browse, search, reuse and delete earlier uploads; pick from the library in any image field. Needs `list`/`delete` on media adapters (S3 ListObjectsV2, repo tree).
2. **Draft / pull-request workflow.** Optional `workflow: "pull-request"`: saves go to a branch and open a PR, a "Review" page lists drafts with publish/discard, deploy-preview links, entries show their draft state.

## Backlog

**Editing experience**
- Live preview of the rendered page (iframe against a preview URL, scroll-synced).
- Rich-text mode for markdown (opt-in, lossless round trip) and MDX component insertion.
- Content-wide search; "used in" and broken-reference warnings for relations and images.
- Conflict handling UI when the repository changed under an open editor.
- Undo/redo inside the form; autosave of local drafts.

**Workflow and access**
- Roles and per-collection permissions (editor, publisher, admin).
- Change history and revert (from Git), per entry.
- Scheduled publishing; webhooks and a "publish" button for hosts that do not rebuild on push.
- Other Git providers: GitLab, Bitbucket, Gitea; other auth providers (SSO, passkeys) behind the same session interface.

**Developer experience**
- Generate TypeScript types and a typed reader from the schema.
- Custom field widgets (not just whole-entry editors) and custom validators that run on the server.
- Schema migrations helper (rename a field across files).
- Presigned uploads straight from the browser to S3, bypassing platform body limits (needs bucket CORS).
- Image optimisation hooks (resize, convert) in the upload pipeline.
- Docs site with recipes per framework; starter templates (Next.js, Astro, SvelteKit).
- Non-React UI entry (web component) so the panel can mount without React.

**Quality**
- Browser-level tests for the panel (drag and drop, translation tabs, upload, validation).
- Accessibility audit (keyboard drag and drop is supported through dnd-kit; screen-reader pass is still to do).
- More panel languages (see below).

**Release**
- Choose a licence, fill in `package.json` (author, repository, bugs), publish to npm, set up CI (typecheck, test, build) and a security contact.

## Known limitations

- The panel UI is React-only (the server is not).
- No draft/review workflow yet: a save is a commit to the configured branch (media uploads with the repo adapter also commit directly).
- No media library to browse earlier uploads; uploads pass through your server, so platform body limits (≈ 6 MB on Netlify/Vercel) apply.
- No rendered preview; markdown is edited as raw text.
- GitHub only; one allow-list, no roles.
- Concurrent editing is last-writer-wins at the file level (a stale save is rejected only if the branch moved between the read and the commit).

## Panel languages

The panel UI is translated through dictionaries in `src/ui/locales/` (`en` is the source and the fallback for any missing key; `tr` is bundled). A project picks the language in its settings:

```ts
defineConfig({
  language: "de",
  // Add a language the package does not ship yet, or reword any string. Missing keys fall back to English.
  translations: { de: { save: "Speichern", cancel: "Abbrechen" /* … */ } },
  // …
});
```

Contributing a language to the package: copy `locales/en.ts` to `locales/<code>.ts`, translate the values (the type checker flags missing keys), register it in `i18n.ts`. A test keeps every bundled language in sync with English.
Planned: de, es, fr, pt-BR, ja, zh-CN, ar (needs right-to-left styles).
