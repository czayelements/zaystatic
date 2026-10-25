import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { githubStore } from "../src/core/store-github";

/* A tiny fake GitHub: only the endpoints the panel uses. */
type Tree = Record<string, string>;
let files: Tree = {};
let head = "c1";
let commits: Record<string, Tree> = { c1: {} };
const blobs: Record<string, string> = {};
let n = 0;
const sha = (s: string) => `sha-${Buffer.from(s).toString("hex").slice(0, 12)}`;
let server: ReturnType<typeof createServer>;
let base = "";
let log: string[] = [];
let racing = false;

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    const send = (code: number, data: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    log.push(`${req.method} ${url.pathname}`);
    assert.equal(req.headers.authorization, "Bearer tok");
    const p = url.pathname.replace("/repos/o/r", "");

    if (req.method === "GET" && p.startsWith("/contents/")) {
      const path = decodeURI(p.slice("/contents/".length));
      const hit = files[path];
      if (hit !== undefined) return send(200, { sha: sha(hit), content: Buffer.from(hit).toString("base64"), encoding: "base64" });
      const dir = Object.keys(files).filter((f) => f.startsWith(`${path}/`) && !f.slice(path.length + 1).includes("/"));
      if (!dir.length) return send(404, { message: "Not Found" });
      return send(200, dir.map((f) => ({ name: f.split("/").pop(), type: "file", sha: sha(files[f]!), path: f })));
    }
    if (req.method === "GET" && p.startsWith("/git/ref/")) return send(200, { object: { sha: head } });
    if (req.method === "GET" && p.startsWith("/git/commits/")) return send(200, { tree: { sha: `tree-${p.split("/").pop()}` } });
    if (req.method === "GET" && p.startsWith("/git/blobs/")) {
      const s = p.split("/").pop()!;
      return send(200, { content: Buffer.from(blobs[s] ?? Object.values(files).find((v) => sha(v) === s) ?? "").toString("base64") });
    }
    if (req.method === "POST" && p === "/git/blobs") {
      const s = `blob-${++n}`;
      blobs[s] = Buffer.from(body.content, "base64").toString();
      return send(201, { sha: s });
    }
    if (req.method === "POST" && p === "/git/trees") {
      const next: Tree = { ...commits[head]! };
      for (const e of body.tree) {
        if (e.sha === null) delete next[e.path];
        else next[e.path] = e.content ?? blobs[e.sha]!;
      }
      const s = `tree-new-${++n}`;
      blobs[s] = JSON.stringify(next);
      return send(201, { sha: s });
    }
    if (req.method === "POST" && p === "/git/commits") {
      const id = `c${++n + 1}`;
      commits[id] = JSON.parse(blobs[body.tree]!);
      assert.deepEqual(body.parents, [head]);
      return send(201, { sha: id, html_url: `https://example/commit/${id}` });
    }
    if (req.method === "PATCH" && p.startsWith("/git/refs/")) {
      if (racing) return send(422, { message: "Update is not a fast forward" });
      assert.equal(body.force, false); // never overwrite someone else's commit
      head = body.sha;
      files = { ...commits[head]! };
      return send(200, {});
    }
    send(500, { message: `unhandled ${req.method} ${p}` });
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const store = () => githubStore("tok", { owner: "o", name: "r", branch: "main" }, base);

test("list + read go through the contents API", async () => {
  files = { "content/a.json": '{"a":1}', "content/b.json": "{}", "content/sub/x.json": "{}" };
  commits = { c1: { ...files } };
  head = "c1";
  const s = store();
  assert.deepEqual((await s.list("content")).sort(), ["a.json", "b.json"]);
  assert.equal(await s.read("content/a.json"), '{"a":1}');
  assert.equal(await s.read("content/nope.json"), null);
  assert.deepEqual(await s.list("missing"), []);
});

test("commit: many files in ONE commit, deletes included, fast-forward only", async () => {
  files = { "content/a.json": "old", "content/gone.json": "bye" };
  commits = { c1: { ...files } };
  head = "c1";
  log = [];
  const res = await store().commit(
    [
      { path: "content/a.json", content: "new" },
      { path: "content/new.json", content: "fresh" },
      { path: "content/gone.json", content: null },
      { path: "public/img.png", content: Buffer.from("PNG").toString("base64"), encoding: "base64" },
    ],
    "content: batch",
  );
  assert.match(res.id!, /^c\d+$/);
  assert.equal(log.filter((l) => l.startsWith("POST /repos/o/r/git/commits")).length, 1);
  assert.deepEqual(Object.keys(files).sort(), ["content/a.json", "content/new.json", "public/img.png"]);
  assert.equal(files["content/a.json"], "new");
  assert.equal(files["public/img.png"], "PNG");
});

test("commit: a concurrent push surfaces a clear error instead of overwriting", async () => {
  files = { "content/a.json": "x" };
  commits = { c1: { ...files } };
  head = "c1";
  racing = true;
  await assert.rejects(store().commit([{ path: "content/a.json", content: "mine" }], "m"), /changed elsewhere/);
  racing = false;
  assert.equal(files["content/a.json"], "x");
});
