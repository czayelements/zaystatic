import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test } from "node:test";

import { createHandler } from "../src/core/api";
import { mediaKey, repoMedia, s3Media, signV4, sniffImage, svgIsSafe } from "../src/core/media";
import { config, tmp } from "./helpers";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const bytes = (s: string) => new TextEncoder().encode(s);

test("SigV4 matches the official AWS documentation vector (GET Object with Range)", () => {
  const h = signV4({
    method: "GET",
    url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
    headers: { range: "bytes=0-9" },
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    date: new Date("2013-05-24T00:00:00Z"),
  });
  assert.match(h.authorization!, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  assert.match(h.authorization!, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,/);
});

test("file type comes from the bytes, not from what the client claims", () => {
  assert.equal(sniffImage(PNG), "image/png");
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(sniffImage(bytes("GIF89a......")), "image/gif");
  assert.equal(sniffImage(bytes("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffImage(bytes("\0\0\0\x1cftypavif\0\0\0\0")), "image/avif");
  assert.equal(sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), "image/svg+xml");
  assert.equal(sniffImage(bytes("just some text, not an image")), null);
  assert.equal(svgIsSafe(bytes("<svg><path d='M0 0'/></svg>")), true);
  assert.equal(svgIsSafe(bytes("<svg onload='x()'></svg>")), false);
  assert.equal(svgIsSafe(bytes("<svg><script>alert(1)</script></svg>")), false);
});

test("keys are slugged, dated and unguessable", () => {
  const k = mediaKey("Kapak Görseli (Final).PNG", "png", new Date("2026-03-09T00:00:00Z"));
  assert.match(k, /^2026\/03\/kapak-gorseli-final-[0-9a-f]{8}\.png$/);
  assert.notEqual(mediaKey("a.png", "png"), mediaKey("a.png", "png"));
});

test("S3 adapter: signed PUT to endpoint/bucket/prefix/key, returns the CDN URL", async () => {
  let seen: { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body: Buffer } | null = null;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    seen = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) };
    res.writeHead(200).end();
  });
  await new Promise<void>((r) => server.listen(0, r));
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const adapter = s3Media({ endpoint, region: "auto", bucket: "media", accessKeyId: "AK", secretAccessKey: "SK", publicUrl: "https://cdn.example.com/", prefix: "uploads/" });
    const out = await adapter.upload({ key: "2026/03/a-1234abcd.png", contentType: "image/png", data: PNG }, { store: null as never });
    assert.equal(out.url, "https://cdn.example.com/uploads/2026/03/a-1234abcd.png");
    assert.equal(seen!.method, "PUT");
    assert.equal(seen!.url, "/media/uploads/2026/03/a-1234abcd.png");
    assert.deepEqual([...seen!.body], [...PNG]);
    assert.equal(seen!.headers["x-amz-content-sha256"], createHash("sha256").update(PNG).digest("hex"));
    assert.equal(seen!.headers["content-type"], "image/png");
    assert.match(String(seen!.headers.authorization), /^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  } finally {
    server.close();
  }
});

test("S3 adapter reports a failed upload", async () => {
  const server = createServer((_req, res) => res.writeHead(403).end("AccessDenied"));
  await new Promise<void>((r) => server.listen(0, r));
  try {
    const adapter = s3Media({ endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, bucket: "b", accessKeyId: "a", secretAccessKey: "s" });
    await assert.rejects(adapter.upload({ key: "k.png", contentType: "image/png", data: PNG }, { store: null as never }), /403 AccessDenied/);
  } finally {
    server.close();
  }
});

/* ── HTTP: /media ───────────────────────────────────────────────── */

const upload = async (h: (r: Request) => Promise<Response>, file: Blob | null, name = "pic.png", headers: Record<string, string> = { "x-zay-request": "1" }) => {
  const body = new FormData();
  if (file) body.append("file", file, name);
  const res = await h(new Request("http://localhost/api/zay/media", { method: "POST", headers, body }));
  return { status: res.status, data: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

test("upload endpoint: stores the file through the adapter and returns its URL", async () => {
  const root = await tmp();
  const h = createHandler({ ...config(root), media: { adapter: repoMedia() } });
  const r = await upload(h, new Blob([PNG], { type: "image/png" }), "Logo Dosyası.png");
  assert.equal(r.status, 200);
  assert.match(r.data.url, /^\/uploads\/\d{4}\/\d{2}\/logo-dosyasi-[0-9a-f]{8}\.png$/);
  const [year] = await readdir(join(root, "public/uploads"));
  assert.ok(year);
  const saved = await readFile(join(root, "public", r.data.url));
  assert.deepEqual([...saved], [...PNG]);
  const session = await (await h(new Request("http://localhost/api/zay/session"))).json();
  assert.equal(session.media.maxBytes, 5 * 1024 * 1024);
});

test("upload endpoint: rejects spoofed types, unsafe SVG, oversize, missing file, CSRF, no adapter", async () => {
  const media = { adapter: repoMedia(), maxBytes: 1024, accept: ["image/png", "image/svg+xml"] };
  const h = createHandler({ ...config(await tmp()), media });
  assert.equal((await upload(h, new Blob([bytes("<html>not an image</html>")], { type: "image/png" }))).status, 415);
  assert.equal((await upload(h, new Blob([bytes("<svg onload='x()'></svg>")], { type: "image/svg+xml" }), "a.svg")).status, 415);
  assert.equal((await upload(h, new Blob([bytes("<svg xmlns='http://www.w3.org/2000/svg'></svg>")], { type: "image/svg+xml" }), "a.svg")).status, 200);
  assert.equal((await upload(h, new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0])], { type: "image/jpeg" }), "a.jpg")).status, 415); // jpeg not accepted here
  assert.equal((await upload(h, new Blob([new Uint8Array(4096).fill(1)], { type: "image/png" }))).status, 413);
  assert.equal((await upload(h, null)).status, 400);
  assert.equal((await upload(h, new Blob([PNG], { type: "image/png" }), "a.png", {})).status, 403);
  const off = createHandler(config(await tmp()));
  assert.equal((await upload(off, new Blob([PNG], { type: "image/png" }))).status, 404);
});
