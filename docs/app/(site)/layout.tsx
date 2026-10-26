import type { Metadata } from "next";

import "../globals.css";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { withBase } from "@/lib/base";
import { site } from "@/site.config";

export const metadata: Metadata = {
  title: { default: `${site.name}: ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
