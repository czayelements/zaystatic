import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * An in-process GitHub: branches, commits, the Git Data API, contents, and pull
 * requests (list/open/get/close/merge with a simple conflict rule). Only what the
 * panel uses, but enough to run the whole pull-request workflow end to end.
 */
type Files = Record<string, string>;
type PR = { number: number; title: string; head: string; base: string; state: "open" | "closed" | "merged"; cutFiles: Files; updated: string };

export async function startFakeGithub(initial: Files) {
  let n = 0;
  const commits: Record<string, { files: Files; parent?: string }> = { c0: { files: { ...initial } } };
  const branches: Record<string, string> = { main: "c0" };
  const trees: Record<string, Files> = {};
  const blobs: Record<string, string> = {};
  const prs: PR[] = [];
  const log: string[] = [];

  const filesOf = (branch: string) => commits[branches[branch]!]!.files;
  const sha = (s: string) => `sha-${createHash("sha1").update(s).digest("hex")}`; /* content-addressed like real Git: different content, different sha */

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const send = (code: number, data?: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(data === undefined ? "" : JSON.stringify(data));
    };
    const p = decodeURIComponent(url.pathname).replace("/repos/o/r", "");
    log.push(`${req.method} ${p}`);

    const pr = (x: PR) => ({ number: x.number, html_url: `https://github.test/o/r/pull/${x.number}`, title: x.title, state: x.state === "open" ? "open" : "closed", updated_at: x.updated, user: { login: "me", avatar_url: "" }, head: { ref: x.head, repo: { full_name: "o/r" } } });

    // refs
    if (req.method === "GET" && p.startsWith("/git/ref/heads/")) {
      const b = p.slice("/git/ref/heads/".length);
      return branches[b] ? send(200, { object: { sha: branches[b] } }) : send(404, { message: "Not Found" });
    }
    if (req.method === "POST" && p === "/git/refs") {
      const b = body.ref.replace("refs/heads/", "");
      if (branches[b]) return send(422, { message: "Reference already exists" });
      branches[b] = body.sha;
      return send(201, {});
    }
    if (req.method === "DELETE" && p.startsWith("/git/refs/heads/")) {
      delete branches[p.slice("/git/refs/heads/".length)];
      return send(204);
    }
    if (req.method === "PATCH" && p.startsWith("/git/refs/heads/")) {
      const b = p.slice("/git/refs/heads/".length);
      if (commits[body.sha]?.parent !== branches[b]) return send(422, { message: "Update is not a fast forward" });
      branches[b] = body.sha;
      return send(200, {});
    }
    // git data
    if (req.method === "GET" && p.startsWith("/git/commits/")) return send(200, { tree: { sha: `tree:${p.split("/").pop()}` } });
    if (req.method === "GET" && p.startsWith("/git/trees/")) {
      const c = p.split("/").pop()!.replace("tree:", "");
      return send(200, { tree: Object.keys(commits[c]?.files ?? {}).map((path) => ({ path, type: "blob" })) });
    }
    if (req.method === "POST" && p === "/git/blobs") {
      const s = `blob-${++n}`;
      blobs[s] = Buffer.from(body.content, "base64").toString();
      return send(201, { sha: s });
    }
    if (req.method === "GET" && p.startsWith("/git/blobs/")) {
      const s = p.split("/").pop()!;
      const text = blobs[s] ?? Object.values(commits).flatMap((c) => Object.values(c.files)).find((v) => sha(v) === s) ?? "";
      return send(200, { content: Buffer.from(text).toString("base64") });
    }
    if (req.method === "POST" && p === "/git/trees") {
      const next: Files = { ...commits[body.base_tree.replace("tree:", "")]!.files };
      for (const e of body.tree) {
        if (e.sha === null) delete next[e.path];
        else next[e.path] = e.content ?? blobs[e.sha]!;
      }
      const s = `newtree:${++n}`;
      trees[s] = next;
      return send(201, { sha: s });
    }
    if (req.method === "POST" && p === "/git/commits") {
      const id = `c${++n}`;
      commits[id] = { files: trees[body.tree]!, parent: body.parents[0] };
      return send(201, { sha: id, html_url: `https://github.test/o/r/commit/${id}` });
    }
    // contents
    if (req.method === "GET" && p.startsWith("/contents/")) {
      const path = p.slice("/contents/".length);
      const ref = url.searchParams.get("ref") ?? "main";
      if (!branches[ref]) return send(404, { message: "No commit found for the ref" });
      const files = filesOf(ref);
      if (files[path] !== undefined) return send(200, { sha: sha(files[path]!), content: Buffer.from(files[path]!).toString("base64"), encoding: "base64" });
      const dir = Object.keys(files).filter((f) => f.startsWith(`${path}/`) && !f.slice(path.length + 1).includes("/"));
      return dir.length ? send(200, dir.map((f) => ({ name: f.split("/").pop(), type: "file", sha: sha(files[f]!), path: f }))) : send(404, { message: "Not Found" });
    }
    // pulls
    if (req.method === "GET" && p === "/pulls") {
      const head = url.searchParams.get("head")?.split(":")[1];
      return send(200, prs.filter((x) => x.state === "open" && (!head || x.head === head)).map(pr));
    }
    if (req.method === "POST" && p === "/pulls") {
      const x: PR = { number: prs.length + 1, title: body.title, head: body.head, base: body.base, state: "open", cutFiles: { ...commits[commits[branches[body.head]!]!.parent ?? "c0"]!.files }, updated: new Date().toISOString() };
      prs.push(x);
      return send(201, pr(x));
    }
    const m = /^\/pulls\/(\d+)(\/merge)?$/.exec(p);
    if (m) {
      const x = prs[Number(m[1]) - 1];
      if (!x) return send(404, { message: "Not Found" });
      if (req.method === "GET") return send(200, pr(x));
      if (req.method === "PATCH") {
        x.state = body.state;
        return send(200, pr(x));
      }
      if (req.method === "PUT" && m[2]) {
        const branch = filesOf(x.head);
        const base = { ...filesOf("main") };
        for (const path of new Set([...Object.keys(branch), ...Object.keys(x.cutFiles)])) {
          if (branch[path] === x.cutFiles[path]) continue; // untouched by the draft
          if (base[path] !== x.cutFiles[path]) return send(405, { message: "Pull Request is not mergeable" }); // changed on base meanwhile
          if (branch[path] === undefined) delete base[path];
          else base[path] = branch[path]!;
        }
        const id = `c${++n}`;
        commits[id] = { files: base, parent: branches.main };
        branches.main = id;
        x.state = "merged";
        return send(200, { merged: true });
      }
    }
    send(500, { message: `unhandled ${req.method} ${p}` });
  });
  await new Promise<void>((r) => server.listen(0, r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    branches,
    prs,
    log,
    main: () => filesOf("main"),
    branchFiles: (b: string) => filesOf(b),
    /** Simulates someone pushing straight to main. */
    pushToMain(path: string, content: string) {
      const id = `c${++n}`;
      commits[id] = { files: { ...filesOf("main"), [path]: content }, parent: branches.main };
      branches.main = id;
    },
    close: () => server.close(),
  };
}
