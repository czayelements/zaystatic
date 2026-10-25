import type { Change, Store } from "./types";

type Repo = { owner: string; name: string; branch: string };

const DEFAULT_API = "https://api.github.com";

/**
 * GitHub repository: reads use the Contents API, writes use the Git Data API
 * (many files in a single commit). Commits are made with the signed-in user's
 * own token.
 */
export function githubStore(token: string, repo: Repo, apiBase: string = DEFAULT_API): Store {
  const base = `${apiBase}/repos/${repo.owner}/${repo.name}`;
  /* Content-addressed: the same sha is always the same text. Kept for the life of the process. */
  const blobs = new Map<string, string>();
  const shaOf = new Map<string, string>();

  const call = async (url: string, init: RequestInit = {}, accept = "application/vnd.github+json") => {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    return res;
  };

  const json = async <T>(res: Response, what: string): Promise<T> => {
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`GitHub ${what}: ${res.status} ${detail.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  };

  const blob = async (sha: string) => {
    const hit = blobs.get(sha);
    if (hit !== undefined) return hit;
    const data = await json<{ content: string }>(await call(`${base}/git/blobs/${sha}`), "blob");
    const text = Buffer.from(data.content, "base64").toString("utf8");
    blobs.set(sha, text);
    return text;
  };

  return {
    kind: "github",

    async list(dir) {
      const res = await call(`${base}/contents/${encodeURI(dir)}?ref=${encodeURIComponent(repo.branch)}`);
      if (res.status === 404) return [];
      const items = await json<{ name: string; type: string; sha: string; path: string }[]>(res, "list");
      if (!Array.isArray(items)) return [];
      for (const item of items) shaOf.set(item.path, item.sha);
      return items.filter((i) => i.type === "file" && !i.name.startsWith(".")).map((i) => i.name);
    },

    async listTree(dir) {
      const res = await call(`${base}/git/trees/${encodeURIComponent(repo.branch)}?recursive=1`);
      const data = await json<{ tree: { path: string; type: string }[]; truncated?: boolean }>(res, "tree");
      const prefix = `${dir.replace(/\/$/, "")}/`;
      return data.tree.filter((e) => e.type === "blob" && e.path.startsWith(prefix) && !e.path.split("/").some((p) => p.startsWith("."))).map((e) => e.path);
    },

    async read(path) {
      const known = shaOf.get(path);
      if (known && blobs.has(known)) return blobs.get(known)!;
      if (known) return blob(known);
      const res = await call(`${base}/contents/${encodeURI(path)}?ref=${encodeURIComponent(repo.branch)}`);
      if (res.status === 404) return null;
      const data = await json<{ sha: string; content?: string; encoding?: string }>(res, "read");
      shaOf.set(path, data.sha);
      if (data.content && data.encoding === "base64") {
        const text = Buffer.from(data.content, "base64").toString("utf8");
        blobs.set(data.sha, text);
        return text;
      }
      return blob(data.sha);
    },

    async commit(changes: Change[], message: string) {
      const head = await json<{ object: { sha: string } }>(
        await call(`${base}/git/ref/heads/${encodeURIComponent(repo.branch)}`),
        "ref",
      );
      const parent = await json<{ tree: { sha: string } }>(await call(`${base}/git/commits/${head.object.sha}`), "commit");

      const tree: Record<string, unknown>[] = [];
      for (const change of changes) {
        if (change.content === null) {
          tree.push({ path: change.path, mode: "100644", type: "blob", sha: null });
        } else if (change.encoding === "base64") {
          const created = await json<{ sha: string }>(
            await call(`${base}/git/blobs`, {
              method: "POST",
              body: JSON.stringify({ content: change.content, encoding: "base64" }),
            }),
            "blob create",
          );
          tree.push({ path: change.path, mode: "100644", type: "blob", sha: created.sha });
        } else {
          tree.push({ path: change.path, mode: "100644", type: "blob", content: change.content });
        }
      }

      const newTree = await json<{ sha: string }>(
        await call(`${base}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: parent.tree.sha, tree }) }),
        "tree",
      );
      const commit = await json<{ sha: string; html_url: string }>(
        await call(`${base}/git/commits`, {
          method: "POST",
          body: JSON.stringify({ message, tree: newTree.sha, parents: [head.object.sha] }),
        }),
        "commit create",
      );
      /* force=false: if another commit slipped in, the update is rejected and nobody's change is overwritten. */
      const update = await call(`${base}/git/refs/heads/${encodeURIComponent(repo.branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      if (update.status === 422) {
        throw new Error("The repository changed elsewhere in the meantime. Reload the page and try again.");
      }
      await json(update, "ref update");
      for (const change of changes) shaOf.delete(change.path);
      return { id: commit.sha, url: commit.html_url };
    },
  };
}
