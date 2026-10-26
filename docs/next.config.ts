import type { NextConfig } from "next";

/*
 * `pnpm build:pages` produces a static export for GitHub Pages: the editing
 * panel and its API need a server, so scripts/build-pages.mjs sets them aside
 * for that build. Everything else (`dev`, `build`, `start`) is the normal app.
 * A project page lives under /<repo>: the workflow sets NEXT_PUBLIC_BASE_PATH.
 */
const exporting = process.env.ZAYSTATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(exporting && {
    output: "export" as const,
    trailingSlash: true,
    basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
    images: { unoptimized: true },
  }),
};

export default nextConfig;
