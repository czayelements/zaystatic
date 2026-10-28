import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Alert } from "@czayelements/zay-ui";

export function Callout({ type = "note", title, children }: { type?: "note" | "tip" | "warning"; title?: string; children: ReactNode }) {
  const label = title ?? { note: "Note", tip: "Tip", warning: "Heads up" }[type];
  const tone = { note: "info", tip: "success", warning: "warning" }[type] as "info" | "success" | "warning";
  return (
    <Alert tone={tone} title={label} className="callout">
      {children}
    </Alert>
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
