import type { ReactNode } from "react";
import { Button, Card, CardDescription, CardTitle } from "@czayelements/zay-ui";
import type { BlockPreviewProps } from "@czayelements/zaystatic/ui";

type Item = { title?: string; text?: string };

/** What each block looks like on the page: the site's own components (here zay-ui). */
export function HeroPreview({ block }: BlockPreviewProps) {
  return (
    <section style={{ background: "var(--inverse)", color: "var(--inverse-foreground)", borderRadius: "var(--radius-card)", padding: "3rem 2rem", textAlign: "center" }}>
      <h2 style={{ margin: 0, fontSize: "2.25rem", lineHeight: 1.12, fontWeight: 600, letterSpacing: "-0.03em" }}>{String(block.title ?? "")}</h2>
      {block.body ? <p style={{ margin: "1rem auto 0", maxWidth: "36ch", color: "#a1a1aa" }}>{String(block.body)}</p> : null}
      {block.cta ? (
        <div style={{ marginTop: "1.5rem" }}>
          <Button variant="secondary" style={{ color: "#09090b" }}>{String(block.cta)}</Button>
        </div>
      ) : null}
    </section>
  );
}

export function FeaturesPreview({ block }: BlockPreviewProps) {
  const items = (Array.isArray(block.items) ? block.items : []) as Item[];
  return (
    <section style={{ padding: "1.5rem 0.25rem" }}>
      <h3 style={{ margin: "0 0 1rem", fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{String(block.heading ?? "")}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
        {items.map((item, i) => (
          <Card key={i} padding="sm" style={{ borderRadius: "var(--radius-lg)" }}>
            <CardTitle>{item.title}</CardTitle>
            <CardDescription>{item.text}</CardDescription>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** The page's background, width and font around every block. */
export function PageFrame({ children }: { children: ReactNode }) {
  return <div style={{ maxWidth: 720, margin: "0 auto", padding: "1rem", fontFamily: "var(--font-sans)" }}>{children}</div>;
}
