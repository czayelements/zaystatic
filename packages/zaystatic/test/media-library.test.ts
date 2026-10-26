import assert from "node:assert/strict";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test } from "node:test";

import { createHandler } from "../src/core/api";
import { repoMedia, s3Media } from "../src/core/media";
import { fsStore } from "../src/core/store-fs";
import { config, tmp } from "./helpers";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const W = { "x-zay-request": "1" };

const seed = async (root: string, keys: string[]) => {
  for (const key of keys) {
    const file = join(root, "public/uploads", key);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, PNG);
  }
};

test("fs store: listTree is recursive and skips dot files", async () => {
  const root = await tmp();
  await seed(root, ["2026/03/a.png", "2026/04/b.png"]);
  await writeFile(join(root, "public/uploads/.DS_Store"), "x");
  assert.deepEqual((await fsStore(root).listTree("public/uploads")).sort(), ["public/uploads/2026/03/a.png", "public/uploads/2026/04/b.png"]);
  assert.deepEqual(await fsStore(root).listTree("nope"), []);
});

test("library over HTTP (repo adapter): newest first, paginated, delete, session flags", async () => {
  const root = await tmp();
  await seed(root, ["2026/01/old-1.png", "2026/02/mid-1.png", "2026/03/new-1.png", "2026/03/new-2.png"]);
  const h = createHandler({ ...config(root), media: { adapter: repoMedia() } });
  const get = async (p: string) => (await h(new Request(`http://localhost/api/zay${p}`))).json();

  const session = await get("/session");
  assert.deepEqual([session.media.library, session.media.canDelete], [true, true]);

  const first = await get("/media?limit=3");
  assert.deepEqual(first.items.map((i: { key: string }) => i.key), ["2026/03/new-2.png", "2026/03/new-1.png", "2026/02/mid-1.png"]);
  assert.equal(first.items[0].url, "/uploads/2026/03/new-2.png");
  const second = await get(`/media?limit=3&cursor=${first.next}`);
  assert.deepEqual(second.items.map((i: { key: string }) => i.key), ["2026/01/old-1.png"]);
  assert.equal(second.next, undefined);

  const del = (key: string, headers: Record<string, string> = W) => h(new Request(`http://localhost/api/zay/media?key=${encodeURIComponent(key)}`, { method: "DELETE", headers }));
  assert.equal((await del("2026/03/new-1.png", {})).status, 403); // CSRF header required
  assert.equal((await del("../../content/site.json")).status, 400); // path traversal
  assert.equal((await del("/etc/passwd")).status, 400);
  assert.equal((await del("2026/03/new-1.png")).status, 200);
  assert.deepEqual(await readdir(join(root, "public/uploads/2026/03")), ["new-2.png"]);
});

test("library is unavailable without list support", async () => {
  const h = createHandler({ ...config(await tmp()), media: { adapter: { upload: async () => ({ url: "/x" }) } } });
  assert.equal((await h(new Request("http://localhost/api/zay/media"))).status, 404);
  const session = await (await h(new Request("http://localhost/api/zay/session"))).json();
  assert.equal(session.media.library, false);
});

test("S3 adapter: signed ListObjectsV2 (newest first, images only, paginated) and DELETE", async () => {
  const seen: { method?: string; url?: string; auth?: string }[] = [];
  const xml = `<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>
    <Contents><Key>up/2026/01/old.png</Key><LastModified>2026-01-02T00:00:00.000Z</LastModified><Size>10</Size></Contents>
    <Contents><Key>up/2026/03/new &amp; shiny.png</Key><LastModified>2026-03-02T00:00:00.000Z</LastModified><Size>30</Size></Contents>
    <Contents><Key>up/notes.txt</Key><LastModified>2026-03-05T00:00:00.000Z</LastModified><Size>1</Size></Contents>
    <Contents><Key>up/2026/02/mid.webp</Key><LastModified>2026-02-02T00:00:00.000Z</LastModified><Size>20</Size></Contents></ListBucketResult>`;
  const server = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, auth: String(req.headers.authorization) });
    if (req.method === "DELETE") return void res.writeHead(204).end();
    res.writeHead(200, { "Content-Type": "application/xml" }).end(xml);
  });
  await new Promise<void>((r) => server.listen(0, r));
  try {
    const adapter = s3Media({ endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, bucket: "media", accessKeyId: "AK", secretAccessKey: "SK", publicUrl: "https://cdn.example.com", prefix: "up/" });
    const ctx = { store: null as never };

    const page1 = await adapter.list!(ctx, { limit: 2 });
    assert.deepEqual(page1.items.map((i) => i.key), ["2026/03/new & shiny.png", "2026/02/mid.webp"]);
    assert.equal(page1.items[0]!.url, "https://cdn.example.com/up/2026/03/new & shiny.png");
    assert.equal(page1.items[0]!.size, 30);
    assert.equal(page1.next, "2");
    assert.deepEqual((await adapter.list!(ctx, { limit: 2, cursor: page1.next })).items.map((i) => i.key), ["2026/01/old.png"]);

    assert.match(seen[0]!.url!, /^\/media\?list-type=2&max-keys=1000&prefix=up%2F$|^\/media\?/);
    assert.ok(seen[0]!.url!.includes("list-type=2") && seen[0]!.url!.includes("prefix=up%2F"));
    assert.match(seen[0]!.auth!, /^AWS4-HMAC-SHA256 Credential=AK\//);

    await adapter.delete!("2026/01/old.png", ctx);
    const del = seen.find((s) => s.method === "DELETE")!;
    assert.equal(del.url, "/media/up/2026/01/old.png");
    await assert.rejects(adapter.delete!("../x", ctx), /invalid key/);
  } finally {
    server.close();
  }
});
