import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";

import "@czayelements/zay-ui/styles.css";
import "../globals.css";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { withBase } from "@/lib/base";
import { site } from "@/site.config";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

/* zay-ui themes with a `dark` class; follow the system setting until the visitor chooses. */
const THEME_BOOT = `try{var m=matchMedia("(prefers-color-scheme: dark)"),f=function(){document.documentElement.classList.toggle("dark",m.matches)};f();m.addEventListener("change",f)}catch(e){}`;

export const metadata: Metadata = {
  title: { default: `${site.name}: ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={dmSans.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <div className="dev-banner">
          <b>Under development.</b> zaystatic is an early alpha: the API may change and it is not production-ready yet.{" "}
          <a href={withBase("/docs/roadmap")}>What is verified and what is not</a>
        </div>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
