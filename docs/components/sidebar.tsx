"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import type { NavSection } from "@/lib/content";

export function Sidebar({ sections }: { sections: NavSection[] }) {
  const path = usePathname();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button type="button" className="nav-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        Menu
      </button>
      <nav className={`sidebar${open ? " is-open" : ""}`} aria-label="Documentation">
        {sections.map((s) => (
          <div key={s.title} className="sidebar-group">
            <h5>{s.title}</h5>
            {s.pages.map((p) => (
              <Link key={p.slug} href={`/docs/${p.slug}`} className={path.replace(/\/$/, "") === `/docs/${p.slug}` ? "is-active" : ""}>
                {p.title}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}
