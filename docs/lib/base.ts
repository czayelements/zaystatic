/**
 * The docs are a static export that GitHub Pages serves under /<repo>. `Link`
 * adds the base path itself; plain `<a>`, `<img>` and `fetch` do not, so they
 * go through this.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const withBase = (path: string) => `${basePath}${path}`;
