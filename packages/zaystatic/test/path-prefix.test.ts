/* eslint-disable @typescript-eslint/no-explicit-any -- tests read loosely-typed JSON */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { createHandler } from "../src/core/api";
import { newSession, seal } from "../src/core/auth";
import { repoMedia } from "../src/core/media";
import { fsStore } from "../src/core/store-fs";
import { normalizePrefix, withPathPrefix } from "../src/core/store-prefix";
import { startFakeGithub } from "./fake-github";
import { config, tmp } from "./helpers";

const SECRET = "zaystatic-test-session-secret-0123456789abcdef";
const ENV = { ZAY_MODE: "github", ZAY_GITHUB_CLIENT_ID: "i", ZAY_GITHUB_CLIENT_SECRET: "s", ZAY_SESSION_SECRET: SECRET, ZAY_ALLOWED_USERS: "me" };
const saved: Record<string, string | undefined> = {};
before(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
after(() => {
  for (const k of [...Object.keys(ENV), "ZAY_PATH_PREFIX"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
const cookie = `zay_session=${encodeURIComponent(seal(newSession({ login: "me" }, "tok"), SECRET))}`;

test("normalizePrefix trims slashes and refuses anything that could leave the repository", () => {
  assert.equal(normalizePrefix("/apps/web/"), "apps/web");
  assert.equal(normalizePrefix("  "), "");
  assert.equal(normalizePrefix(undefined), "");
  assert.throws(() => normalizePrefix("../etc"), /invalid pathPrefix/);
  assert.throws(() => normalizePrefix("a/./b"), /invalid pathPrefix/);
});

test("withPathPrefix makes a sub-folder the content root for every store call", async () => {
  const root = await tmp();
  await mkdir(join(root, "site/content/posts"), { recursive: true });
  await writeFile(join(root, "site/content/posts/a.json"), "{}");
  const store = withPathPrefix(fsStore(root), "site");
  assert.deepEqual(await store.list("content/posts"), ["a.json"]);
  assert.equal(await store.read("content/posts/a.json"), "{}");
  assert.deepEqual(await store.listTree("content"), ["content/posts/a.json"]);
  await store.commit([{ path: "content/posts/b.json", content: "[]" }], "m");
  assert.equal(await readFile(join(root, "site/content/posts/b.json"), "utf8"), "[]");
  const plain = fsStore(root);
  assert.equal(withPathPrefix(plain, ""), plain); // no prefix: the very same store
});

const setup = async (extra: object = {}) => {
  const gh = await startFakeGithub({ "site/content/people/ada.json": '{"name":"Ada"}\n' });
  const handler = createHandler({ ...config(await tmp()), repo: { owner: "o", name: "r", branch: "main", apiUrl: gh.url, pathPrefix: "site" }, media: { adapter: repoMedia() }, ...extra });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await handler(new Request(`http://localhost/api/zay${path}`, { method, headers: { cookie, "x-zay-request": "1", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }));
    return { status: res.status, data: (await res.json().catch(() => null)) as any };
  };
  return { gh, call };
};

test("GitHub mode with pathPrefix: the panel reads and writes inside that folder only", async () => {
  const { gh, call } = await setup();
  try {
    const list = await call("GET", "/collections/people");
    assert.deepEqual(list.data.entries.map((e: any) => e.slug), ["ada"]); // found at site/content/people
    await call("POST", "/collections/people/bob", { docs: { tr: { name: "Bob" } } });
    assert.ok(gh.main()["site/content/people/bob.json"]);
    assert.ok(!gh.main()["content/people/bob.json"]); // never at the repository root

    const png = new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])], { type: "image/png" });
    const form = new FormData();
    form.append("file", png, "a.png");
    const up = await (await (async () => {
      const handler = createHandler({ ...config(await tmp()), repo: { owner: "o", name: "r", branch: "main", apiUrl: gh.url, pathPrefix: "site" }, media: { adapter: repoMedia() } });
      return handler(new Request("http://localhost/api/zay/media", { method: "POST", headers: { cookie, "x-zay-request": "1" }, body: form }));
    })()).json();
    assert.match(up.url, /^\/uploads\//);
    assert.ok(Object.keys(gh.main()).some((f) => f.startsWith("site/public/uploads/")));
  } finally {
    gh.close();
  }
});

test("pull-request drafts honour the prefix too", async () => {
  const { gh, call } = await setup({ workflow: "pull-request" });
  try {
    const saved = await call("POST", "/collections/people/cy", { docs: { tr: { name: "Cy" } } });
    assert.equal(saved.data.draft.number, 1);
    assert.ok(gh.branchFiles("zay/c/people/cy")["site/content/people/cy.json"]);
    assert.equal((await call("GET", "/collections/people/cy")).data.docs.tr.name, "Cy"); // read back from the draft branch
    assert.equal((await call("POST", "/drafts/1/publish", {})).status, 200);
    assert.ok(gh.main()["site/content/people/cy.json"]);
  } finally {
    gh.close();
  }
});

test("ZAY_PATH_PREFIX overrides the configured prefix (blank means not set)", async () => {
  const gh = await startFakeGithub({ "docs/content/people/zed.json": '{"name":"Zed"}\n', "site/content/people/ada.json": '{"name":"Ada"}\n' });
  try {
    const handler = createHandler({ ...config(await tmp()), repo: { owner: "o", name: "r", branch: "main", apiUrl: gh.url, pathPrefix: "site" } });
    const slugs = async () => {
      const res = await handler(new Request("http://localhost/api/zay/collections/people", { headers: { cookie } }));
      return ((await res.json()) as any).entries.map((e: any) => e.slug);
    };
    assert.deepEqual(await slugs(), ["ada"]);
    process.env.ZAY_PATH_PREFIX = "docs";
    assert.deepEqual(await slugs(), ["zed"]);
    process.env.ZAY_PATH_PREFIX = "  ";
    assert.deepEqual(await slugs(), ["ada"]);
  } finally {
    gh.close();
    delete process.env.ZAY_PATH_PREFIX;
  }
});
