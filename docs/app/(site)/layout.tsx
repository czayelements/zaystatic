import type { Metadata } from "next";

import "../globals.css";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { site } from "@/site.config";

export const metadata: Metadata = {
  title: { default: `${site.name}: ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
