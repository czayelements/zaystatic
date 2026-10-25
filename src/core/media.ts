import { createHash, createHmac, randomBytes } from "node:crypto";

import type { Store } from "./types";

/**
 * Image upload. The panel sends the file to the server; the server validates it
 * (size, type, the file's real bytes) and hands it to a MediaAdapter. An adapter
 * only has to "store these bytes under this key and return the public URL":
 * any S3-compatible storage (AWS S3, Cloudflare R2, MinIO, Backblaze B2,
 * DigitalOcean Spaces …) or the repository itself (`public/uploads`) will do.
 */

export type MediaFile = { key: string; contentType: string; data: Uint8Array };
export type MediaContext = { store: Store };

export type MediaItem = {
  /** Same key the adapter received on upload (without the adapter's own prefix). */
  key: string;
  url: string;
  size?: number;
  /** ISO timestamp when the storage provides one. */
  modified?: string;
};

export interface MediaAdapter {
  upload(file: MediaFile, ctx: MediaContext): Promise<{ url: string }>;
  /** Optional: enables the media library. Newest first; `cursor` is opaque (return `next` to continue). */
  list?(ctx: MediaContext, opts: { cursor?: string; limit: number }): Promise<{ items: MediaItem[]; next?: string }>;
  /** Optional: enables deleting from the library. */
  delete?(key: string, ctx: MediaContext): Promise<void>;
}

/** Library listing cap: the newest N objects are considered (keeps listing to one storage request). */
export const LIST_CAP = 1000;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
/** Keys the panel may ask to delete: plain path segments only. */
export const SAFE_KEY = /^(?!.*\.\.)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

const page = <T>(all: T[], cursor: string | undefined, limit: number) => {
  const from = Math.max(0, Number(cursor) || 0);
  const items = all.slice(from, from + limit);
  return { items, ...(from + limit < all.length ? { next: String(from + limit) } : {}) };
};

export type MediaConfig = {
  adapter: MediaAdapter;
  /** Default 5 MB (Netlify/Vercel function body limits are ~6 MB). */
  maxBytes?: number;
  /** Default: png, jpeg, webp, gif, avif. SVG can carry scripts, so it must be added deliberately. */
  accept?: string[];
};

export const DEFAULT_ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];
export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/* ── File type: judged by the bytes, not by what the client claims ── */

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export function sniffImage(b: Uint8Array): string | null {
  const at = (i: number, s: string) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  if (b.length > 8 && b[0] === 0x89 && at(1, "PNG")) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && (at(0, "GIF87a") || at(0, "GIF89a"))) return "image/gif";
  if (b.length > 12 && at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  if (b.length > 12 && at(4, "ftyp") && (at(8, "avif") || at(8, "avis"))) return "image/avif";
  const head = Buffer.from(b.subarray(0, 512)).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

/** No script/event handlers inside the SVG? (A coarse, defensive check; do not accept untrusted SVG.) */
export const svgIsSafe = (b: Uint8Array) =>
  !/<script|javascript:|\son\w+\s*=|<foreignobject|<iframe|<embed|<object/i.test(Buffer.from(b).toString("utf8"));

export const mediaKey = (name: string, ext: string, now = new Date()) => {
  const slug =
    name
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[ıİ]/g, "i")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "image";
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}/${mm}/${slug}-${randomBytes(4).toString("hex")}.${ext}`;
};

export const extFor = (type: string) => EXT[type] ?? "bin";

/* ── AWS Signature V4 ──────────────────────────────────────────── */

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

export type SignInput = {
  method: string;
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  date?: Date;
};

/** Returns the signed headers (including x-amz-date, x-amz-content-sha256, authorization). */
export function signV4(i: SignInput): Record<string, string> {
  const service = i.service ?? "s3";
  const amzDate = (i.date ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...i.headers, host: i.headers.host ?? i.url.host })) headers[k.toLowerCase()] = String(v).trim();
  headers["x-amz-date"] = headers["x-amz-date"] ?? amzDate;
  headers["x-amz-content-sha256"] = i.payloadHash;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const path = i.url.pathname
    .split("/")
    .map((seg) => encodeURIComponent(decodeURIComponent(seg)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
  const query = [...i.url.searchParams.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const canonical = [i.method, path, query, canonicalHeaders, signedHeaders, i.payloadHash].join("\n");

  const scope = `${day}/${i.region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", headers["x-amz-date"], scope, sha256(canonical)].join("\n");
  const kDate = hmac(`AWS4${i.secretAccessKey}`, day);
  const key = hmac(hmac(hmac(kDate, i.region), service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

/* ── Adapter: S3-compatible storage ────────────────────────────── */

export type S3Options = {
  /** E.g. https://<account>.r2.cloudflarestorage.com, http://localhost:9000 (MinIO). AWS when omitted. */
  endpoint?: string;
  region?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public base URL of uploaded files (CDN), e.g. https://cdn.example.com */
  publicUrl?: string;
  /** Key prefix, e.g. "uploads/". */
  prefix?: string;
  /** true (default): endpoint/bucket/key. false: bucket.endpoint/key (virtual-hosted style). */
  pathStyle?: boolean;
  cacheControl?: string;
};

export function s3Media(o: S3Options): MediaAdapter {
  const region = o.region ?? "us-east-1";
  const endpoint = new URL(o.endpoint ?? `https://s3.${region}.amazonaws.com`);
  const pathStyle = o.pathStyle ?? true;
  const prefix = (o.prefix ?? "uploads/").replace(/^\/+/, "");
  const cache = o.cacheControl ?? "public, max-age=31536000, immutable"; // the file name carries a random suffix, so the object never changes

  const objectUrl = (key: string) =>
    pathStyle
      ? `${endpoint.origin}${endpoint.pathname.replace(/\/$/, "")}/${o.bucket}/${key}`
      : `${endpoint.protocol}//${o.bucket}.${endpoint.host}${endpoint.pathname.replace(/\/$/, "")}/${key}`;
  const publicUrl = (key: string, fallback?: URL) => {
    const base = o.publicUrl?.replace(/\/$/, "");
    return base ? `${base}/${key}` : (fallback ?? new URL(objectUrl(key))).toString();
  };

  return {
    async upload(file) {
      const key = `${prefix}${file.key}`;
      const url = new URL(objectUrl(key));
      const headers = signV4({
        method: "PUT",
        url,
        headers: { "content-type": file.contentType, "cache-control": cache },
        payloadHash: sha256(file.data),
        region,
        accessKeyId: o.accessKeyId,
        secretAccessKey: o.secretAccessKey,
      });
      const { host: _host, ...send } = headers; // fetch sets the host header itself
      void _host;
      const res = await fetch(url, { method: "PUT", headers: send, body: Buffer.from(file.data), cache: "no-store" });
      if (!res.ok) throw new Error(`S3 upload failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
      return { url: publicUrl(key, url) };
    },

    async list(_ctx, { cursor, limit }) {
      const url = new URL(objectUrl(""));
      url.pathname = pathStyle ? `${endpoint.pathname.replace(/\/$/, "")}/${o.bucket}` : `${endpoint.pathname.replace(/\/$/, "")}/`;
      url.searchParams.set("list-type", "2");
      url.searchParams.set("prefix", prefix);
      url.searchParams.set("max-keys", String(LIST_CAP));
      const headers = signV4({ method: "GET", url, headers: {}, payloadHash: sha256(""), region, accessKeyId: o.accessKeyId, secretAccessKey: o.secretAccessKey });
      const { host: _h, ...send } = headers;
      void _h;
      const res = await fetch(url, { headers: send, cache: "no-store" });
      if (!res.ok) throw new Error(`S3 list failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
      const xml = await res.text();
      const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1];
      const decode = (v: string) => v.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
      const all: MediaItem[] = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)]
        .map(([, block]) => ({ full: decode(tag(block!, "Key") ?? ""), size: Number(tag(block!, "Size")), modified: tag(block!, "LastModified") }))
        .filter((e) => e.full.startsWith(prefix) && IMAGE_EXT.test(e.full))
        .map((e) => ({ key: e.full.slice(prefix.length), url: publicUrl(e.full), size: e.size, modified: e.modified }))
        .sort((a, b) => String(b.modified ?? b.key).localeCompare(String(a.modified ?? a.key)));
      return page(all, cursor, limit);
    },

    async delete(key) {
      if (!SAFE_KEY.test(key)) throw new Error("invalid key");
      const url = new URL(objectUrl(`${prefix}${key}`));
      const headers = signV4({ method: "DELETE", url, headers: {}, payloadHash: sha256(""), region, accessKeyId: o.accessKeyId, secretAccessKey: o.secretAccessKey });
      const { host: _h, ...send } = headers;
      void _h;
      const res = await fetch(url, { method: "DELETE", headers: send, cache: "no-store" });
      if (!res.ok && res.status !== 404) throw new Error(`S3 delete failed: ${res.status}`);
    },
  };
}

/** From ZAY_S3_* environment variables; null when no bucket is set (pick another adapter). */
export function s3MediaFromEnv(env: Record<string, string | undefined> = process.env): MediaAdapter | null {
  if (!env.ZAY_S3_BUCKET || !env.ZAY_S3_ACCESS_KEY_ID || !env.ZAY_S3_SECRET_ACCESS_KEY) return null;
  return s3Media({
    endpoint: env.ZAY_S3_ENDPOINT,
    region: env.ZAY_S3_REGION ?? "auto",
    bucket: env.ZAY_S3_BUCKET,
    accessKeyId: env.ZAY_S3_ACCESS_KEY_ID,
    secretAccessKey: env.ZAY_S3_SECRET_ACCESS_KEY,
    publicUrl: env.ZAY_S3_PUBLIC_URL,
    prefix: env.ZAY_S3_PREFIX,
    pathStyle: env.ZAY_S3_PATH_STYLE !== "false",
  });
}

/* ── Adapter: commit into the repository (public/uploads) ──────── */

export function repoMedia(o: { dir?: string; urlPrefix?: string } = {}): MediaAdapter {
  const dir = (o.dir ?? "public/uploads").replace(/\/$/, "");
  const urlPrefix = (o.urlPrefix ?? "/uploads").replace(/\/$/, "");
  return {
    async upload(file, { store }) {
      await store.commit(
        [{ path: `${dir}/${file.key}`, content: Buffer.from(file.data).toString("base64"), encoding: "base64" }],
        `media: add ${file.key.split("/").pop()}`,
      );
      return { url: `${urlPrefix}/${file.key}` };
    },

    async list({ store }, { cursor, limit }) {
      const files = await store.listTree(dir);
      const all: MediaItem[] = files
        .filter((f) => IMAGE_EXT.test(f))
        .map((f) => f.slice(dir.length + 1))
        .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)) // YYYY/MM/ prefix: newest first
        .map((key) => ({ key, url: `${urlPrefix}/${key}` }));
      return page(all, cursor, limit);
    },

    async delete(key, { store }) {
      if (!SAFE_KEY.test(key)) throw new Error("invalid key");
      await store.commit([{ path: `${dir}/${key}`, content: null }], `media: remove ${key.split("/").pop()}`);
    },
  };
}
