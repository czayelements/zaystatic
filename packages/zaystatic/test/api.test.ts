/* eslint-disable @typescript-eslint/no-explicit-any -- test helper reads loosely-typed JSON */
import assert from "node:assert/strict";
import { test } from "node:test";

import { createHandler } from "../src/core/api";
import { newSession, resolveMode, seal, unseal } from "../src/core/auth";
import { config, tmp } from "./helpers";

const call = async (h: (r: Request) => Promise<Response>, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await h(new Request(`http://localhost${path}`, { method, headers: { ...headers, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, data: (await res.json().catch(() => null)) as Record<string, any> | null, res };
};
const W = { "x-zay-request": "1" };

test("local mode: session, schema, create → read → delete over HTTP", async () => {
  const h = createHandler({ ...config(await tmp()), repo: undefined });
  const session = await call(h, "GET", "/api/zay/session");
  assert.equal(session.data!.mode, "local");

  const schema = await call(h, "GET", "/api/zay/schema");
  assert.deepEqual(Object.keys(schema.data!.collections), ["posts", "people", "items"]);

  const created = await call(h, "POST", "/api/zay/collections/people/ada", { docs: { tr: { name: "Ada" } } }, W);
  assert.equal(created.status, 200);
  const read = await call(h, "GET", "/api/zay/collections/people/ada");
  assert.equal(read.data!.docs.tr.name, "Ada");
  assert.equal((await call(h, "DELETE", "/api/zay/collections/people/ada", undefined, W)).status, 200);
  assert.equal((await call(h, "GET", "/api/zay/collections/people/ada")).status, 404);
});

test("writes need the custom header and a same-origin Origin (CSRF)", async () => {
  const h = createHandler(config(await tmp()));
  const body = { docs: { tr: { name: "x" } } };
  assert.equal((await call(h, "POST", "/api/zay/collections/people/x", body)).status, 403);
  assert.equal((await call(h, "POST", "/api/zay/collections/people/x", body, { ...W, origin: "https://evil.example" })).status, 403);
  assert.equal((await call(h, "POST", "/api/zay/collections/people/x", body, { ...W, origin: "http://localhost" })).status, 200);
});

test("malformed input and unknown routes", async () => {
  const h = createHandler(config(await tmp()));
  const bad = await h(new Request("http://localhost/api/zay/collections/people/x", { method: "POST", headers: W, body: "{nope" }));
  assert.equal(bad.status, 400);
  assert.equal((await call(h, "GET", "/api/zay/nothing")).status, 404);
  assert.equal((await call(h, "GET", "/api/zay/collections/constructor")).status, 404);
});

test("github mode without credentials is closed; production never falls back to local files", () => {
  const cfg = config("/x");
  assert.equal(resolveMode(cfg, { NODE_ENV: "production" }), "unconfigured");
  assert.equal(resolveMode(cfg, { NODE_ENV: "development" }), "local");
  assert.equal(resolveMode(cfg, { NODE_ENV: "production", ZAY_MODE: "github" }), "unconfigured");
  const ready = { ZAY_GITHUB_CLIENT_ID: "i", ZAY_GITHUB_CLIENT_SECRET: "s", ZAY_SESSION_SECRET: "k", ZAY_ALLOWED_USERS: "me" };
  assert.equal(resolveMode({ ...cfg, repo: { owner: "o", name: "r" } }, { NODE_ENV: "production", ...ready }), "github");
  assert.equal(resolveMode(cfg, { NODE_ENV: "production", ...ready }), "unconfigured"); // no repo
});

test("session cookie: sealed, tamper-proof, expiring", () => {
  const s = newSession({ login: "me" }, "gh-token");
  const sealed = seal(s, "secret");
  assert.ok(!sealed.includes("gh-token")); // token is encrypted, not just signed
  assert.equal(unseal(sealed, "secret")?.login, "me");
  assert.equal(unseal(sealed, "other-secret"), null);
  assert.equal(unseal(sealed.slice(0, -2) + "xx", "secret"), null);
  assert.equal(unseal(seal({ ...s, exp: Date.now() - 1 }, "secret"), "secret"), null);
  assert.equal(unseal(undefined, "secret"), null);
});
