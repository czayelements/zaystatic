import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import { createNodeHandler } from "../src/node";
import { repoMedia } from "../src/core/media";
import { config, tmp } from "./helpers";

test("Node adapter: plain http server serves the API, JSON bodies and multipart uploads", async () => {
  const server = createServer(createNodeHandler({ ...config(await tmp()), media: { adapter: repoMedia() } }));
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/zay`;
  try {
    const session = await (await fetch(`${base}/session`)).json();
    assert.equal(session.mode, "local");

    const created = await fetch(`${base}/collections/people/ada`, {
      method: "POST",
      headers: { "x-zay-request": "1", "content-type": "application/json" },
      body: JSON.stringify({ docs: { tr: { name: "Ada" } } }),
    });
    assert.equal(created.status, 200);
    assert.equal((await (await fetch(`${base}/collections/people/ada`)).json()).docs.tr.name, "Ada");

    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "a.png");
    const up = await fetch(`${base}/media`, { method: "POST", headers: { "x-zay-request": "1" }, body: form });
    assert.equal(up.status, 200);
    assert.match((await up.json()).url, /^\/uploads\//);

    assert.equal((await fetch(`${base}/nothing`)).status, 404);
  } finally {
    server.close();
  }
});
