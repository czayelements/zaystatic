import type { Metadata } from "next";

import "@czayelements/zay-ui/tokens.css";
import "@czayelements/zay-ui/base.css";
import "@czayelements/zay-ui/components.css";
import "@czayelements/zaystatic/styles.css";

export const metadata: Metadata = { title: "zaystatic example", robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
