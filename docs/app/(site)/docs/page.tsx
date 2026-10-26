import Link from "next/link";

import { withBase } from "@/lib/base";
import { navigation } from "@/lib/content";

/*
 * A plain redirect() does not survive a static export under a base path, so
 * this page sends the visitor on with a meta refresh and keeps a link.
 */
export default function DocsIndex() {
  const href = `/docs/${navigation()[0]?.pages[0]?.slug ?? "introduction"}`;
  return (
    <main className="doc">
      <meta httpEquiv="refresh" content={`0; url=${withBase(href)}/`} />
      <p>
        <Link href={href}>Go to the documentation</Link>
      </p>
    </main>
  );
}
