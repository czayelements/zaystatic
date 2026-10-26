import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Callout({ type = "note", title, children }: { type?: "note" | "tip" | "warning"; title?: string; children: ReactNode }) {
  const label = title ?? { note: "Note", tip: "Tip", warning: "Heads up" }[type];
  return (
    <aside className={`callout callout-${type}`}>
      <strong>{label}</strong>
      <div>{children}</div>
    </aside>
  );
}

/** Numbered steps: each `###` heading inside becomes a step. */
export function Steps({ children }: { children: ReactNode }) {
  return <div className="steps">{children}</div>;
}

export const mdxComponents = {
  Callout,
  Steps,
  a: ({ href = "", ...props }: ComponentProps<"a">) =>
    href.startsWith("/") || href.startsWith("#") ? <Link href={href} {...(props as object)} /> : <a href={href} target="_blank" rel="noreferrer" {...props} />,
  table: (props: ComponentProps<"table">) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
};
