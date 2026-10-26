import type { Metadata } from "next";

import "@czayelements/zaystatic/styles.css";

export const metadata: Metadata = { title: "zaystatic docs · panel", robots: { index: false, follow: false } };

/* The panel has its own root layout: no site chrome around it. */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
