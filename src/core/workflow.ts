import { githubClient, githubStore } from "./store-github";
import type { GithubClient } from "./store-github";
import { HttpError } from "./types";
import type { Change, DraftRef, ResolvedConfig, Store, WorkflowConfig } from "./types";

/**
 * Pull-request workflow. Every unit of editing (one entry, one singleton, one
 * file of a file set) has its own draft branch; saving commits to that branch and
 * opens a pull request against the configured branch. Reading shows the draft
 * while one is open. Publishing merges the PR; discarding closes it.
 */

export type Target =
  | { kind: "c"; name: string; slug: string }
  | { kind: "s"; name: string }
  | { kind: "f"; name: string; file: string };

export type Draft = DraftRef & {
  target: Target;
  title: string;
  updatedAt: string;
  author?: { login: string; avatar?: string };
};

export type Workflow = Required<Omit<WorkflowConfig, "previewUrl">> & { previewUrl?: string };

export function workflowOf(config: ResolvedConfig): Workflow {
  const w = config.workflow;
  const o: WorkflowConfig = typeof w === "string" ? { mode: w } : (w ?? { mode: "direct" });
  return { mode: o.mode, branchPrefix: o.branchPrefix ?? "zay/", previewUrl: o.previewUrl, mergeMethod: o.mergeMethod ?? "squash" };
}

const PART = /^[A-Za-z0-9_-]+$/;
const part = (v: string) => {
  if (!PART.test(v)) throw new HttpError(400, "Invalid name");
  return v;
};

export function branchFor(prefix: string, t: Target): string {
  if (t.kind === "c") return `${prefix}c/${part(t.name)}/${part(t.slug)}`;
  if (t.kind === "s") return `${prefix}s/${part(t.name)}`;
  return `${prefix}f/${part(t.name)}/${part(t.file)}`;
}

export function targetOf(prefix: string, branch: string): Target | null {
  if (!branch.startsWith(prefix)) return null;
  const [kind, a, b] = branch.slice(prefix.length).split("/");
  if (kind === "c" && a && b) return { kind: "c", name: a, slug: b };
  if (kind === "s" && a && !b) return { kind: "s", name: a };
  if (kind === "f" && a && b) return { kind: "f", name: a, file: b };
  return null;
}

type RawPR = {
  number: number;
  html_url: string;
  title: string;
  updated_at: string;
  state: string;
  merged_at?: string | null;
  user?: { login: string; avatar_url?: string };
  head: { ref: string; repo?: { full_name: string } | null };
};

export class PullRequests {
  private api: GithubClient;
  constructor(
    private token: string,
    private repo: { owner: string; name: string; branch: string },
    private wf: Workflow,
    private apiUrl?: string,
  ) {
    this.api = githubClient(token, repo, apiUrl);
  }

  private ref(pr: RawPR): DraftRef {
    const preview = this.wf.previewUrl?.replace("{pr}", String(pr.number)).replace("{branch}", encodeURIComponent(pr.head.ref));
    return { number: pr.number, url: pr.html_url, branch: pr.head.ref, ...(preview ? { previewUrl: preview } : {}) };
  }

  /** The open draft PR for `branch`, if any. */
  async findOpen(branch: string): Promise<DraftRef | null> {
    const q = new URLSearchParams({ state: "open", head: `${this.repo.owner}:${branch}`, per_page: "5" });
    const prs = await this.api.json<RawPR[]>(await this.api.call(`${this.api.base}/pulls?${q}`), "pulls");
    const pr = prs.find((p) => p.head.ref === branch);
    return pr ? this.ref(pr) : null;
  }

  /** All open draft PRs created by the panel. */
  async list(): Promise<Draft[]> {
    const q = new URLSearchParams({ state: "open", per_page: "100", sort: "updated", direction: "desc" });
    const prs = await this.api.json<RawPR[]>(await this.api.call(`${this.api.base}/pulls?${q}`), "pulls");
    const out: Draft[] = [];
    for (const pr of prs) {
      const target = targetOf(this.wf.branchPrefix, pr.head.ref);
      if (!target || (pr.head.repo && pr.head.repo.full_name.toLowerCase() !== `${this.repo.owner}/${this.repo.name}`.toLowerCase())) continue;
      out.push({
        ...this.ref(pr),
        target,
        title: pr.title,
        updatedAt: pr.updated_at,
        ...(pr.user ? { author: { login: pr.user.login, avatar: pr.user.avatar_url } } : {}),
      });
    }
    return out;
  }

  private async headSha(branch: string): Promise<string | null> {
    const res = await this.api.call(`${this.api.base}/git/ref/heads/${encodeURIComponent(branch).replace(/%2F/g, "/")}`);
    if (res.status === 404) return null;
    return (await this.api.json<{ object: { sha: string } }>(res, "ref")).object.sha;
  }

  async deleteBranch(branch: string) {
    await this.api.call(`${this.api.base}/git/refs/heads/${branch}`, { method: "DELETE" });
  }

  /** A fresh draft branch cut from the current base; a leftover branch of a merged/closed PR is replaced. */
  async startBranch(branch: string) {
    if ((await this.headSha(branch)) !== null) await this.deleteBranch(branch);
    const base = await this.headSha(this.repo.branch);
    if (!base) throw new Error(`Base branch "${this.repo.branch}" not found`);
    await this.api.json(
      await this.api.call(`${this.api.base}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base }) }),
      "create branch",
    );
  }

  async open(branch: string, title: string): Promise<DraftRef> {
    const pr = await this.api.json<RawPR>(
      await this.api.call(`${this.api.base}/pulls`, {
        method: "POST",
        body: JSON.stringify({ title, head: branch, base: this.repo.branch, body: "Draft created from the zay-static panel. Publish or discard it there, or merge this pull request." }),
      }),
      "open pull request",
    );
    return this.ref(pr);
  }

  /** The open draft with this number; refuses anything the panel did not create. */
  private async draft(number: number): Promise<RawPR> {
    const res = await this.api.call(`${this.api.base}/pulls/${number}`);
    if (res.status === 404) throw new HttpError(404, "Draft not found");
    const pr = await this.api.json<RawPR>(res, "pull request");
    if (pr.state !== "open" || !targetOf(this.wf.branchPrefix, pr.head.ref)) throw new HttpError(404, "Draft not found");
    return pr;
  }

  async publish(number: number) {
    const pr = await this.draft(number);
    const res = await this.api.call(`${this.api.base}/pulls/${number}/merge`, { method: "PUT", body: JSON.stringify({ merge_method: this.wf.mergeMethod }) });
    if (res.status === 405 || res.status === 409) {
      throw new HttpError(409, "This draft cannot be merged automatically (the content changed on the base branch). Resolve it on GitHub.");
    }
    await this.api.json(res, "merge");
    await this.deleteBranch(pr.head.ref);
  }

  async discard(number: number) {
    const pr = await this.draft(number);
    await this.api.json(await this.api.call(`${this.api.base}/pulls/${number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) }), "close");
    await this.deleteBranch(pr.head.ref);
  }
}

export type DraftStore = Store & { info(): Promise<DraftRef | null> };

/**
 * A store for one editing target. Reads come from the draft branch while a draft is
 * open (otherwise from the base branch); the first save creates the branch and the
 * pull request, later saves add commits to it.
 */
export function draftStore(opts: {
  base: Store;
  prs: PullRequests;
  token: string;
  repo: { owner: string; name: string; branch: string };
  apiUrl?: string;
  branch: string;
}): DraftStore {
  const { base, prs, branch } = opts;
  const onBranch = githubStore(opts.token, { ...opts.repo, branch }, opts.apiUrl);
  let current: DraftRef | null | undefined;
  const draft = async () => (current === undefined ? (current = await prs.findOpen(branch)) : current);
  const reader = async () => ((await draft()) ? onBranch : base);

  return {
    kind: "github",
    list: async (dir) => (await reader()).list(dir),
    listTree: async (dir) => (await reader()).listTree(dir),
    read: async (path) => (await reader()).read(path),
    info: draft,
    async commit(changes: Change[], message: string) {
      let d = await draft();
      if (!d) await prs.startBranch(branch);
      const res = await onBranch.commit(changes, message);
      if (!d) d = await prs.open(branch, message.split("\n")[0]!);
      current = d;
      return { ...res, draft: d };
    },
  };
}
