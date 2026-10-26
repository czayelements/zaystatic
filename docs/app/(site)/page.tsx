import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { home } from "@/lib/content";
import { site } from "@/site.config";

const SCHEMA = `import { defineSchema, defineCollection } from "zaystatic";
import { str, markdown, image, select } from "zaystatic/schema";

export default defineSchema({
  collections: {
    posts: defineCollection({
      label: "Posts",
      dir: "content/posts",
      ext: "mdx",
      identifier: "title",
      i18n: { enabled: true, fields: ["title", "body"] },
      fields: {
        title: str("Title", { required: true, maxLength: 80 }),
        cover: image("Cover"),
        status: select("Status", [
          { label: "Draft", value: "draft" },
          { label: "Live", value: "live" },
        ]),
        body: markdown("Body"),
      },
    }),
  },
});`;

const MOUNT = `// app/api/cms/[...path]/route.ts
import { createNextHandlers } from "zaystatic/next";
import config from "@/zaystatic.config";

export const { GET, POST, PUT, DELETE } = createNextHandlers(config);

// app/cms/panel.tsx
"use client";
import { ZayApp } from "zaystatic/ui";
export const Panel = () => <ZayApp apiPath="/api/cms" />;`;

export default function Landing() {
  const content = home();
  return (
    <main>
      <section className="hero wrap">
        <span className="pill">Open source · Git-based · No database</span>
        <h1>{content.title || "A content panel for your repository"}</h1>
        <p>{content.subtitle || site.description}</p>
        <div className="cta-row">
          <Link href="/docs/quick-start" className="btn btn-primary">
            Get started
          </Link>
          <Link href="/docs/introduction" className="btn">
            Read the docs
          </Link>
          <span className="install">
            <code>{site.install}</code>
            <CopyButton text={site.install} />
          </span>
        </div>
        <div className="shot">
          <div className="shot-bar" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static screenshot */}
          <img src="/screens/builder.png" alt="The visual page builder: a page drawn by the site's own blocks, with a palette and settings panel on the right." width={1236} height={913} />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>Everything an editor needs, nothing your repo does not own</h2>
          <p className="sub">Your content stays as plain files. zaystatic is the panel on top.</p>
          <div className="features">
            {content.features.map((f, i) => (
              <div key={f.title} className="feature">
                <div className="feature-icon">{i + 1}</div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>Describe your content in code</h2>
          <p className="sub">One schema drives the panel&apos;s forms and the reader that builds your site, so they cannot drift apart.</p>
          <div className="split">
            <div>
              <h3>Schema in TypeScript</h3>
              <p>Collections, singletons and UI-string files, with typed fields: text, markdown, images, selects, relations, lists, objects and blocks.</p>
              <ul>
                <li>Validation rules enforced on the server and shown in the panel</li>
                <li>Translation chosen per collection, field by field</li>
                <li>Plain ESM helpers your build script can import</li>
              </ul>
              <p style={{ marginTop: 16 }}>
                <Link href="/docs/content-model">Learn about the content model →</Link>
              </p>
            </div>
            <div className="code-card">
              <header>zaystatic.schema.ts</header>
              <pre>{SCHEMA}</pre>
            </div>
          </div>
          <div className="split reverse">
            <div>
              <h3>Mount it in minutes</h3>
              <p>The server is a plain <code>(Request) =&gt; Response</code> function with adapters for Next.js and Node; the panel is one React component.</p>
              <p>
                <Link href="/docs/quick-start">Follow the quick start →</Link>
              </p>
            </div>
            <div className="code-card">
              <header>two small files</header>
              <pre>{MOUNT}</pre>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>Built for real content</h2>
          <div className="split">
            <div>
              <h3>Translate what you choose</h3>
              <p>Turn on <code>i18n</code> per collection, list the fields to translate, and editors switch language tabs with the source text shown under every field.</p>
              <p>
                <Link href="/docs/translating-content">Translating content →</Link>
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- a static screenshot */}
            <div className="shot"><img loading="lazy" src="/screens/translate.png" alt="A language tab showing the default-language text under each field." width={1236} height={913} /></div>
          </div>
          <div className="split reverse">
            <div>
              <h3>Drag, drop, done</h3>
              <p>Every list and block sorts by dragging. Structure changes in the default language are mirrored into the translations.</p>
              <p>
                <Link href="/docs/field-types">Field types →</Link>
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- a static screenshot */}
            <div className="shot"><img loading="lazy" src="/screens/lists.png" alt="Sortable lists with collapsible rows." width={1500} height={913} /></div>
          </div>
          <div className="split">
            <div>
              <h3>Your page, your look</h3>
              <p>The block builder draws each block with <em>your</em> components, so editors see what visitors will. Write custom editors and field widgets for anything else.</p>
              <p>
                <Link href="/docs/block-builder">The block builder →</Link>
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- a static screenshot */}
            <div className="shot"><img loading="lazy" src="/screens/panel.png" alt="The panel with its sidebar, tabs and a collection list." width={1500} height={913} /></div>
          </div>
        </div>
      </section>

      <section className="final">
        <h2>Try it on your site</h2>
        <p>Open source. Your content, your repository, your hosting.</p>
        <div className="cta-row">
          <Link href="/docs/quick-start" className="btn btn-primary">
            Quick start
          </Link>
          <a href={site.repo} className="btn" target="_blank" rel="noreferrer">
            Star on GitHub
          </a>
        </div>
      </section>
    </main>
  );
}
