import Link from "next/link";
import { buttonClass } from "@czayelements/zay-ui";

import { Logo } from "./logo";
import { Search } from "./search";
import { site } from "@/site.config";

export function Header() {
  return (
    <header className="site-header">
      <div className="site-header-in">
        <Link href="/" className="brand">
          <Logo />
          <span>{site.name}</span>
        </Link>
        <nav className="top-nav" aria-label="Main">
          <Link href="/docs/introduction" className={buttonClass({ variant: "ghost", size: "sm", pill: true })}>Docs</Link>
          <Link href="/docs/quick-start" className={buttonClass({ variant: "ghost", size: "sm", pill: true })}>Quick start</Link>
          <Link href="/docs/roadmap" className={buttonClass({ variant: "ghost", size: "sm", pill: true })}>Roadmap</Link>
        </nav>
        <span className="grow" />
        <Search />
        <a className={buttonClass({ variant: "ghost", size: "sm", icon: true, pill: true })} href={site.repo} target="_blank" rel="noreferrer" aria-label="GitHub">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.1-1.46-1.1-1.46-.9-.62.07-.6.07-.6 1 .07 1.52 1.03 1.52 1.03.89 1.52 2.34 1.08 2.9.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
          </svg>
        </a>
      </div>
    </header>
  );
}
