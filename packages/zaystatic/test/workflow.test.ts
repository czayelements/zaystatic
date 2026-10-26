/* eslint-disable @typescript-eslint/no-explicit-any -- tests read loosely-typed JSON */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { createHandler } from "../src/core/api";
import { newSession, seal } from "../src/core/auth";
import { branchFor, targetOf } from "../src/core/workflow";
import { config } from "./helpers";
import { startFakeGithub } from "./fake-github";

const ENV = { ZAY_MODE: "github", ZAY_GITHUB_CLIENT_ID: "i", ZAY_GITHUB_CLIENT_SECRET: "s", ZAY_SESSION_SECRET: "secret", ZAY_ALLOWED_USERS: "me" };
const saved: Record<string, string | undefined> = {};
before(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
after(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const cookie = `zay_session=${encodeURIComponent(seal(newSession({ login: "me" }, "tok"), "secret"))}`;

const setup = async (workflow: "direct" | "pull-request" = "pull-request") => {
  const gh = await startFakeGithub({});
  const base = config("/unused");
  const handler = createHandler({
    ...base,
    repo: { owner: "o", name: "r", branch: "main", apiUrl: gh.url },
    workflow: workflow === "direct" ? "direct" : { mode: "pull-request", previewUrl: "https://deploy-preview-{pr}--site.example" },
  });
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = { "x-zay-request": "1" }) => {
    const res = await handler(new Request(`http://localhost/api/zay${path}`, { method, headers: { cookie, ...headers, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined }));
    return { status: res.status, data: (await res.json().catch(() => null)) as any };
  };
  return { gh, call };
};

test("branch naming round-trips and rejects odd names", () => {
  assert.equal(branchFor("zay/", { kind: "c", name: "blog", slug: "my-post" }), "zay/c/blog/my-post");
  assert.deepEqual(targetOf("zay/", "zay/f/messages/shell"), { kind: "f", name: "messages", file: "shell" });
  assert.deepEqual(targetOf("zay/", "zay/s/navigation"), { kind: "s", name: "navigation" });
  assert.equal(targetOf("zay/", "feature/x"), null);
  assert.throws(() => branchFor("zay/", { kind: "c", name: "a/b", slug: "x" }));
});

test("save opens a draft PR and leaves the base branch alone; later saves reuse it", async () => {
  const { gh, call } = await setup();
  try {
    assert.equal((await call("GET", "/session")).data.workflow, "pull-request");
    const first = await call("POST", "/collections/people/ada", { docs: { tr: { name: "Ada" } } });
    assert.equal(first.status, 200);
    assert.equal(first.data.draft.number, 1);
    assert.equal(first.data.draft.previewUrl, "https://deploy-preview-1--site.example");
    assert.deepEqual(Object.keys(gh.branches).sort(), ["main", "zay/c/people/ada"]);
    assert.deepEqual(Object.keys(gh.main()), []); // nothing published yet
    assert.ok(gh.branchFiles("zay/c/people/ada")["content/people/ada.json"]);

    const second = await call("PUT", "/collections/people/ada", { docs: { tr: { name: "Ada Lovelace" } } });
    assert.equal(second.data.draft.number, 1);
    assert.equal(gh.prs.length, 1); // same pull request
    assert.match(gh.branchFiles("zay/c/people/ada")["content/people/ada.json"]!, /Ada Lovelace/);
  } finally {
    gh.close();
  }
});

test("reading shows the draft (and the list flags it); unchanged re-saves add nothing", async () => {
  const { gh, call } = await setup();
  try {
    await call("POST", "/collections/people/ada", { docs: { tr: { name: "Ada" } } });
    const read = await call("GET", "/collections/people/ada");
    assert.equal(read.data.docs.tr.name, "Ada");
    assert.equal(read.data.draft.number, 1);
    const list = await call("GET", "/collections/people");
    assert.deepEqual(list.data.drafts, ["ada"]);
    assert.deepEqual(list.data.entries, []); // exists only as a draft
    const again = await call("PUT", "/collections/people/ada", { docs: { tr: { name: "Ada" } } });
    assert.equal(again.data.unchanged, true);
  } finally {
    gh.close();
  }
});

test("publish merges the PR into main and removes the branch", async () => {
  const { gh, call } = await setup();
  try {
    await call("POST", "/collections/people/ada", { docs: { tr: { name: "Ada" } } });
    const drafts = await call("GET", "/drafts");
    assert.deepEqual(drafts.data.drafts.map((d: any) => [d.number, d.target]), [[1, { kind: "c", name: "people", slug: "ada" }]]);

    assert.equal((await call("POST", "/drafts/1/publish", {})).status, 200);
    assert.ok(gh.main()["content/people/ada.json"]);
    assert.equal(gh.branches["zay/c/people/ada"], undefined);
    assert.deepEqual((await call("GET", "/drafts")).data.drafts, []);
    const read = await call("GET", "/collections/people/ada");
    assert.equal(read.data.draft, undefined); // now served from main
    assert.equal(read.data.docs.tr.name, "Ada");

    // a later edit starts a fresh branch and a new PR
    const next = await call("PUT", "/collections/people/ada", { docs: { tr: { name: "Ada L." } } });
    assert.equal(next.data.draft.number, 2);
  } finally {
    gh.close();
  }
});

test("discard closes the PR and drops the branch; main stays as it was", async () => {
  const { gh, call } = await setup();
  try {
    await call("POST", "/collections/people/ada", { docs: { tr: { name: "Ada" } } });
    assert.equal((await call("DELETE", "/drafts/1")).status, 200);
    assert.equal(gh.branches["zay/c/people/ada"], undefined);
    assert.deepEqual(Object.keys(gh.main()), []);
    assert.equal((await call("GET", "/collections/people/ada")).status, 404);
  } finally {
    gh.close();
  }
});

test("publishing a draft that conflicts with a newer main is refused with a clear message", async () => {
  const { gh, call } = await setup();
  try {
    await call("POST", "/collections/people/ada", { docs: { tr: { name: "Ada" } } });
    gh.pushToMain("content/people/ada.json", '{"name":"someone else"}\n');
    const res = await call("POST", "/drafts/1/publish", {});
    assert.equal(res.status, 409);
    assert.match(res.data.error, /cannot be merged automatically/);
    assert.ok(gh.branches["zay/c/people/ada"]); // the draft survives
  } finally {
    gh.close();
  }
});

test("the panel only touches its own drafts, and only with the CSRF header", async () => {
  const { gh, call } = await setup();
  try {
    // a pull request the panel did not create
    gh.prs.push({ number: 1, title: "Feature", head: "feature/x", base: "main", state: "open", cutFiles: {}, updated: "" });
    assert.equal((await call("POST", "/drafts/1/publish", {})).status, 404);
    assert.equal((await call("DELETE", "/drafts/1")).status, 404);
    assert.equal((await call("POST", "/drafts/1/publish", {}, {})).status, 403);
    assert.equal((await call("POST", "/drafts/abc/publish", {})).status, 404);
  } finally {
    gh.close();
  }
});

test("singletons and file-set files get their own drafts", async () => {
  const { gh, call } = await setup();
  try {
    const s = await call("PUT", "/singletons/settings", { doc: { title: "Hi" } });
    assert.equal(s.data.draft.number, 1);
    assert.ok(gh.branches["zay/s/settings"]);
    assert.equal((await call("GET", "/singletons/settings")).data.docs.tr.title, "Hi");
  } finally {
    gh.close();
  }
});

test("direct mode (default) commits straight to the base branch and has no drafts", async () => {
  const { gh, call } = await setup("direct");
  try {
    assert.equal((await call("GET", "/session")).data.workflow, "direct");
    const res = await call("POST", "/collections/people/ada", { docs: { tr: { name: "Ada" } } });
    assert.equal(res.data.draft, undefined);
    assert.ok(gh.main()["content/people/ada.json"]);
    assert.deepEqual(Object.keys(gh.branches), ["main"]);
    assert.equal((await call("GET", "/drafts")).status, 404);
  } finally {
    gh.close();
  }
});
