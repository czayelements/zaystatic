import type { Metadata } from "next";

import "@czayelements/zay-ui/styles.css";
import "@czayelements/zaystatic/styles.css";

/* zay-ui themes with a `dark` class; follow the system setting. */
const THEME_BOOT = `try{var m=matchMedia("(prefers-color-scheme: dark)"),f=function(){document.documentElement.classList.toggle("dark",m.matches)};f();m.addEventListener("change",f)}catch(e){}`;

export const metadata: Metadata = { title: "zaystatic docs · panel", robots: { index: false, follow: false } };

/* The panel has its own root layout: no site chrome around it. */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
