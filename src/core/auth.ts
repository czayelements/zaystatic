import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { ResolvedConfig, ZayConfig } from "./types";

export type Session = { login: string; name?: string; avatar?: string; token: string; exp: number };
export type Mode = "local" | "github" | "unconfigured";

export const SESSION_COOKIE = "zay_session";
export const STATE_COOKIE = "zay_oauth_state";
const SESSION_HOURS = 8;

type Env = Record<string, string | undefined>;

export const oauthEnv = (env: Env = process.env) => ({
  clientId: env.ZAY_GITHUB_CLIENT_ID,
  clientSecret: env.ZAY_GITHUB_CLIENT_SECRET,
  sessionSecret: env.ZAY_SESSION_SECRET,
  allowed: (env.ZAY_ALLOWED_USERS ?? "")
    .split(",")
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean),
  publicUrl: env.ZAY_PUBLIC_URL?.replace(/\/$/, ""),
});

/**
 * Run mode:
 *  - ZAY_MODE=local  → local files, no sign-in (for your own machine only)
 *  - ZAY_MODE=github → GitHub sign-in + commits to the repository
 *  - unset: local in development; in production github when the GitHub
 *    settings are complete, otherwise closed
 */
export function resolveMode(config: ZayConfig, env: Env = process.env): Mode {
  const forced = env.ZAY_MODE;
  if (forced === "local") return "local";
  const o = oauthEnv(env);
  const ready = Boolean(o.clientId && o.clientSecret && o.sessionSecret && o.allowed.length && config.repo);
  if (forced === "github") return ready ? "github" : "unconfigured";
  if (env.NODE_ENV !== "production") return "local";
  return ready ? "github" : "unconfigured";
}

/* ── Cookie: session sealed with AES-256-GCM ──────────────────── */

const key = (secret: string) => createHash("sha256").update(`zay-static:${secret}`).digest();

export function seal(session: Session, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal(value: string | undefined, secret: string | undefined): Session | null {
  if (!value || !secret) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const session = JSON.parse(text) as Session;
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export const newSession = (user: { login: string; name?: string; avatar?: string }, token: string): Session => ({
  ...user,
  token,
  exp: Date.now() + SESSION_HOURS * 3600_000,
});

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name: string, value: string, opts: { secure: boolean; maxAge?: number }) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    opts.secure ? "Secure" : "",
    opts.maxAge !== undefined ? `Max-Age=${opts.maxAge}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/* ── GitHub OAuth ───────────────────────────────────────────────── */

export const authorizeUrl = (clientId: string, redirectUri: string, state: string) =>
  `https://github.com/login/oauth/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: "repo", state })}`;

export async function exchangeCode(code: string, redirectUri: string, env: Env = process.env): Promise<string> {
  const o = oauthEnv(env);
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: o.clientId, client_secret: o.clientSecret, code, redirect_uri: redirectUri }),
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) throw new Error(data.error_description ?? "GitHub sign-in could not be completed");
  return data.access_token;
}

export async function githubUser(token: string) {
  const res = await fetch("https://api.github.com/user", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error("Could not fetch the GitHub user");
  const u = (await res.json()) as { login: string; name?: string; avatar_url?: string };
  return { login: u.login, name: u.name ?? undefined, avatar: u.avatar_url };
}

export async function canPush(token: string, repo: { owner: string; name: string }) {
  const res = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return false;
  const r = (await res.json()) as { permissions?: { push?: boolean } };
  return r.permissions?.push === true;
}
