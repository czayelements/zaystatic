"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button, CommandPalette, Kbd, type CommandGroup, type CommandItem } from "@czayelements/zay-ui";

import { withBase } from "@/lib/base";

type Entry = { slug: string; title: string; description: string; headings: { text: string; id: string }[]; text: string };

/** ⌘K / Ctrl+K search over page titles, descriptions and headings, in the zay-ui command palette. */
export function Search() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState<Entry[] | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (open && !index) fetch(withBase("/search.json")).then((r) => r.json()).then(setIndex).catch(() => setIndex([]));
  }, [open, index]);

  const groups: CommandGroup[] = React.useMemo(() => {
    if (!index) return [];
    const pages: CommandItem[] = index.map((p) => ({ value: `/docs/${p.slug}`, label: p.description ? `${p.title}: ${p.description}` : p.title, hint: "Page" }));
    const sections: CommandItem[] = index.flatMap((p) => p.headings.map((h) => ({ value: `/docs/${p.slug}#${h.id}`, label: `${p.title} › ${h.text}`, hint: "Section" })));
    return [
      { value: "Pages", items: pages },
      { value: "Sections", items: sections },
    ];
  }, [index]);

  return (
    <>
      <Button variant="secondary" size="sm" pill onClick={() => setOpen(true)} aria-label="Search the docs">
        Search
        <Kbd>⌘K</Kbd>
      </Button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        groups={groups}
        placeholder="Search the documentation…"
        emptyText={index ? "No results found." : "Loading…"}
        onSelect={(item) => router.push(item.value)}
      />
    </>
  );
}
