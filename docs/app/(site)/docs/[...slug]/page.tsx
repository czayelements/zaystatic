import rehypeShiki from "@shikijs/rehype";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { mdxComponents } from "@/components/mdx";
import { Sidebar } from "@/components/sidebar";
import { Toc } from "@/components/toc";
import { allPages, getPage, headings, navigation, neighbours } from "@/lib/content";
import { site } from "@/site.config";

export function generateStaticParams() {
  return allPages().map((p) => ({ slug: [p.slug] }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const page = getPage((await params).slug.join("/"));
  return page ? { title: page.title, description: page.description } : {};
}

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const slug = (await params).slug.join("/");
  const page = getPage(slug);
  if (!page) notFound();
  const { prev, next } = neighbours(slug);
  const section = navigation().find((s) => s.pages.some((p) => p.slug === slug))?.title;

  return (
    <div className="docs-shell">
      <Sidebar sections={navigation()} />
      <main className="doc">
        <article>
          {section && <p className="eyebrow">{section}</p>}
          <h1>{page.title}</h1>
          {page.description && <p className="lede">{page.description}</p>}
          <div className="prose">
            <MDXRemote
              source={page.body}
              components={mdxComponents}
              options={{
                mdxOptions: {
                  remarkPlugins: [remarkGfm],
                  rehypePlugins: [rehypeSlug, [rehypeShiki, { themes: { light: "github-light", dark: "github-dark" }, defaultColor: false }]],
                },
              }}
            />
          </div>
          <nav className="pager" aria-label="Previous and next">
            {prev ? (
              <Link href={`/docs/${prev.slug}`} className="prev">
                <small>Previous</small>
                <b>{prev.title}</b>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/docs/${next.slug}`} className="next">
                <small>Next</small>
                <b>{next.title}</b>
              </Link>
            )}
          </nav>
          <p className="edit">
            <a href={`${site.repo}/edit/main/docs/content/docs/${slug}.mdx`} target="_blank" rel="noreferrer">Edit this page on GitHub</a>
            {process.env.NODE_ENV === "development" && (
              <>
                {" · "}
                <a href={`/zaystatic/c/docs/${slug}`}>Edit with zaystatic</a>
              </>
            )}
          </p>
        </article>
        <Toc headings={headings(page.body)} />
      </main>
    </div>
  );
}
