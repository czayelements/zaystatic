import type { Store } from "./types";

/** "/site/content/" -> "site/content"; rejects anything that could climb out of the repository. */
export function normalizePrefix(prefix: string | undefined | null): string {
  const p = (prefix ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (p.split("/").some((part) => part === ".." || part === ".")) throw new Error(`invalid pathPrefix: ${prefix}`);
  return p;
}

/**
 * Makes a store see a sub-folder of its repository as the content root, so the same schema
 * (`dir: "content/blog"`) works whether the content sits at the repository root or in a
 * folder such as `apps/web`.
 */
export function withPathPrefix(store: Store, prefix: string | undefined | null): Store {
  const p = normalizePrefix(prefix);
  if (!p) return store;
  const abs = (path: string) => `${p}/${path.replace(/^\/+/, "")}`;
  return {
    kind: store.kind,
    list: (dir) => store.list(abs(dir)),
    read: (path) => store.read(abs(path)),
    listTree: async (dir) => (await store.listTree(abs(dir))).map((f) => f.slice(p.length + 1)),
    commit: (changes, message) => store.commit(changes.map((c) => ({ ...c, path: abs(c.path) })), message),
  };
}
