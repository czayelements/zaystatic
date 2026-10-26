import Link from "next/link";

import { Logo } from "./logo";
import { site } from "@/site.config";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-in">
        <div>
          <Link href="/" className="brand">
            <Logo size={24} />
            <span>{site.name}</span>
          </Link>
          <p>{site.tagline}. Open source.</p>
        </div>
        <nav aria-label="Footer">
          <Link href="/docs/introduction">Documentation</Link>
          <Link href="/docs/quick-start">Quick start</Link>
          <Link href="/docs/roadmap">Roadmap</Link>
          <a href={site.repo} target="_blank" rel="noreferrer">GitHub</a>
          <a href={site.npm} target="_blank" rel="noreferrer">npm</a>
        </nav>
      </div>
    </footer>
  );
}
