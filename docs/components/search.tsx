"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

type Entry = { slug: string; title: string; description: string; headings: { text: string; id: string }[]; text: string };
type Hit = { href: string; title: string; context: string };

/** ⌘K / Ctrl+K search over page titles, headings and text. */
export function Search() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [index, setIndex] = React.useState<Entry[] | null>(null);
  const [active, setActive] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    window.setTimeout(() => input.current?.focus(), 0);
    if (!index) fetch("/search.json").then((r) => r.json()).then(setIndex).catch(() => setIndex([]));
  }, [open, index]);

  const hits: Hit[] = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !index) return [];
    const out: Hit[] = [];
    for (const p of index) {
      if (p.title.toLowerCase().includes(needle)) out.push({ href: `/docs/${p.slug}`, title: p.title, context: p.description });
      for (const h of p.headings) if (h.text.toLowerCase().includes(needle)) out.push({ href: `/docs/${p.slug}#${h.id}`, title: h.text, context: p.title });
      const at = p.text.toLowerCase().indexOf(needle);
      if (at >= 0 && !p.title.toLowerCase().includes(needle)) out.push({ href: `/docs/${p.slug}`, title: p.title, context: `…${p.text.slice(Math.max(0, at - 40), at + 90)}…` });
    }
    return out.slice(0, 12);
  }, [q, index]);

  const go = (hit: Hit | undefined) => {
    if (!hit) return;
    setOpen(false);
    router.push(hit.href);
  };

  return (
    <>
      <button type="button" className="search-btn" onClick={() => setOpen(true)} aria-label="Search the docs">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>
      {open && (
        <div className="search-back" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="search-box" role="dialog" aria-modal="true" aria-label="Search">
            <input
              ref={input}
              value={q}
              placeholder="Search the documentation…"
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, hits.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") go(hits[active]);
              }}
            />
            <ul>
              {hits.map((h, i) => (
                <li key={`${h.href}${i}`}>
                  <Link href={h.href} className={i === active ? "is-active" : ""} onClick={() => setOpen(false)} onMouseEnter={() => setActive(i)}>
                    <b>{h.title}</b>
                    <small>{h.context}</small>
                  </Link>
                </li>
              ))}
              {q && index && !hits.length && <li className="empty">No results for “{q}”.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
