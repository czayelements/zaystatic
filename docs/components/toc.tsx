"use client";

import * as React from "react";

import type { Heading } from "@/lib/content";

/** "On this page": the page's headings, with the one in view highlighted. */
export function Toc({ headings }: { headings: Heading[] }) {
  const [current, setCurrent] = React.useState<string | null>(headings[0]?.id ?? null);
  React.useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => Boolean(e));
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setCurrent(visible.target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [headings]);
  if (!headings.length) return null;
  return (
    <aside className="toc" aria-label="On this page">
      <h5>On this page</h5>
      {headings.map((h) => (
        <a key={h.id} href={`#${h.id}`} className={`${h.depth === 3 ? "sub " : ""}${current === h.id ? "is-active" : ""}`}>
          {h.text}
        </a>
      ))}
    </aside>
  );
}
