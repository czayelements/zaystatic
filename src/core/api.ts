import {
  SESSION_COOKIE,
  STATE_COOKIE,
  authorizeUrl,
  canPush,
  cookie,
  exchangeCode,
  githubUser,
  newSession,
  oauthEnv,
  parseCookies,
  resolveMode,
  safeEqual,
  seal,
  unseal,
} from "./auth";
import type { Session } from "./auth";
import {
  deleteEntry,
  listEntries,
  listFileSetFiles,
  optionsOf,
  readEntry,
  readFileSet,
  readSingleton,
  writeEntry,
  writeFileSet,
  writeSingleton,
} from "./content";
import { DEFAULT_ACCEPT, DEFAULT_MAX_BYTES, extFor, mediaKey, sniffImage, svgIsSafe } from "./media";
import { fsStore } from "./store-fs";
import { githubStore } from "./store-github";
import { HttpError } from "./types";
import type { Store, ZayConfig } from "./types";

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...init.headers },
  });

const MAX_BODY = 4 * 1024 * 1024;

/**
 * Çerçeveden bağımsız istek işleyicisi: Web `Request` alır, `Response` döner.
 * Next.js, Hono, Express (fetch uyarlayıcıyla) … hepsinde aynı.
 */
export function createHandler(config: ZayConfig) {
  const api = config.apiPath.replace(/\/$/, "");

  return async function handle(request: Request): Promise<Response> {
    try {
      return await route(request);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, { status: error.status });
      console.error("[zay-static]", error);
      return json({ error: (error as Error).message || "Beklenmeyen hata" }, { status: 500 });
    }
  };

  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const parts = url.pathname.slice(api.length).split("/").filter(Boolean).map(decodeURIComponent);
    const mode = resolveMode(config);
    const env = oauthEnv();
    const origin = env.publicUrl ?? url.origin;
    const secure = origin.startsWith("https:");
    const cookies = parseCookies(request.headers.get("cookie"));

    /* ── Oturum ve giriş (kimlik gerektirmeyen uçlar) ── */
    if (parts[0] === "auth") {
      if (mode !== "github") throw new HttpError(400, "GitHub girişi bu kipte kapalı");
      const redirectUri = `${origin}${api}/auth/callback`;

      if (parts[1] === "login" && method === "GET") {
        const state = (await import("node:crypto")).randomBytes(16).toString("hex");
        return new Response(null, {
          status: 302,
          headers: {
            Location: authorizeUrl(env.clientId!, redirectUri, state),
            "Set-Cookie": cookie(STATE_COOKIE, state, { secure, maxAge: 600 }),
          },
        });
      }

      if (parts[1] === "callback" && method === "GET") {
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code");
        const home = (msg?: string) =>
          new Response(null, {
            status: 302,
            headers: new Headers([
              ["Location", `${origin}${config.basePath}${msg ? `?error=${encodeURIComponent(msg)}` : ""}`],
              ["Set-Cookie", cookie(STATE_COOKIE, "", { secure, maxAge: 0 })],
            ]),
          });
        if (!code || !cookies[STATE_COOKIE] || !safeEqual(state, cookies[STATE_COOKIE]!)) return home("Giriş doğrulanamadı, tekrar dene.");

        const token = await exchangeCode(code, redirectUri);
        const user = await githubUser(token);
        if (!env.allowed.includes(user.login.toLowerCase())) return home("Bu hesabın panele erişimi yok.");
        if (config.repo && !(await canPush(token, config.repo))) return home("Bu hesabın depoya yazma yetkisi yok.");

        const res = home();
        res.headers.append("Set-Cookie", cookie(SESSION_COOKIE, seal(newSession(user, token), env.sessionSecret!), { secure, maxAge: 8 * 3600 }));
        return res;
      }

      if (parts[1] === "logout" && method === "POST") {
        return json({ ok: true }, { headers: { "Set-Cookie": cookie(SESSION_COOKIE, "", { secure, maxAge: 0 }) } });
      }
      throw new HttpError(404, "bulunamadı");
    }

    const session: Session | null = mode === "github" ? unseal(cookies[SESSION_COOKIE], env.sessionSecret) : null;

    if (parts[0] === "session" && method === "GET") {
      return json({
        mode,
        user: mode === "local" ? { login: "local" } : session && { login: session.login, name: session.name, avatar: session.avatar },
        repo: config.repo ? `${config.repo.owner}/${config.repo.name}` : null,
        branch: config.repo?.branch ?? "main",
        name: config.name ?? "zay-static",
        language: config.language ?? "en",
        apiPath: api,
        basePath: config.basePath,
        media: config.media
          ? { maxBytes: config.media.maxBytes ?? DEFAULT_MAX_BYTES, accept: config.media.accept ?? DEFAULT_ACCEPT }
          : null,
      });
    }

    /* ── Buradan sonrası kimlik ister ── */
    if (mode === "unconfigured") throw new HttpError(503, "Panel yapılandırılmadı (ZAY_* ortam değişkenleri).");
    if (mode === "github" && !session) throw new HttpError(401, "Giriş gerekli");

    if (method !== "GET") {
      /* Başka bir sitenin formu/isteği tarayıcıdan bizi çağıramasın: özel başlık + aynı köken. */
      if (request.headers.get("x-zay-request") !== "1") throw new HttpError(403, "Geçersiz istek");
      const from = request.headers.get("origin");
      if (from && from !== url.origin && from !== origin) throw new HttpError(403, "Geçersiz köken");
    }

    const store: Store =
      mode === "local"
        ? fsStore(config.root ?? process.cwd())
        : githubStore(session!.token, { ...config.repo!, branch: config.repo!.branch ?? "main" });
    const ctx = { config, store };

    const body = async () => {
      const text = await request.text();
      if (text.length > MAX_BODY) throw new HttpError(413, "İçerik çok büyük");
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new HttpError(400, "Geçersiz JSON");
      }
    };

    if (parts[0] === "media" && method === "POST") {
      const media = config.media;
      if (!media) throw new HttpError(404, "Görsel yükleme yapılandırılmamış");
      const maxBytes = media.maxBytes ?? DEFAULT_MAX_BYTES;
      const accept = media.accept ?? DEFAULT_ACCEPT;
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (declared > maxBytes + 64 * 1024) throw new HttpError(413, `Dosya çok büyük (en çok ${Math.round(maxBytes / 1024 / 1024)} MB)`);

      const form = await request.formData().catch(() => null);
      const file = form?.get("file");
      if (!file || typeof file === "string") throw new HttpError(400, "Dosya yok");
      if (file.size > maxBytes) throw new HttpError(413, `Dosya çok büyük (en çok ${Math.round(maxBytes / 1024 / 1024)} MB)`);

      const data = new Uint8Array(await file.arrayBuffer());
      const type = sniffImage(data);
      if (!type || !accept.includes(type)) throw new HttpError(415, "Desteklenmeyen dosya türü");
      if (type === "image/svg+xml" && !svgIsSafe(data)) throw new HttpError(415, "SVG betik içeriyor");

      const key = mediaKey(file.name || "image", extFor(type));
      const { url } = await media.adapter.upload({ key, contentType: type, data }, { store });
      return json({ ok: true, url, size: data.byteLength, contentType: type });
    }

    if (parts[0] === "schema" && method === "GET") {
      return json({
        locales: config.locales,
        defaultLocale: config.defaultLocale,
        localeNames: config.localeNames ?? {},
        groups: config.groups ?? [],
        collections: config.collections,
        singletons: config.singletons ?? {},
        fileSets: Object.fromEntries(
          Object.entries(config.fileSets ?? {}).map(([k, v]) => [k, { label: v.label, group: v.group }]),
        ),
      });
    }

    if (parts[0] === "collections") {
      const [, name, slug, extra] = parts;
      if (name && !slug && method === "GET") return json({ entries: await listEntries(ctx, name) });
      if (name && slug === "_options" && method === "GET") return json({ options: await optionsOf(ctx, name) });
      if (name && slug && !extra) {
        if (method === "GET") return json(await readEntry(ctx, name, slug));
        if (method === "PUT" || method === "POST") {
          const b = await body();
          const result = await writeEntry(ctx, name, slug, (b.docs ?? {}) as Record<string, unknown>, { create: method === "POST" });
          return json({ ok: true, ...result });
        }
        if (method === "DELETE") return json({ ok: true, ...(await deleteEntry(ctx, name, slug)) });
      }
    }

    if (parts[0] === "singletons" && parts[1]) {
      if (method === "GET") return json(await readSingleton(ctx, parts[1]));
      if (method === "PUT") return json({ ok: true, ...(await writeSingleton(ctx, parts[1], (await body()).doc)) });
    }

    if (parts[0] === "filesets" && parts[1]) {
      const [, name, file] = parts;
      if (!file && method === "GET") return json({ files: await listFileSetFiles(ctx, name!) });
      if (file && method === "GET") return json(await readFileSet(ctx, name!, file));
      if (file && method === "PUT") {
        return json({ ok: true, ...(await writeFileSet(ctx, name!, file, ((await body()).docs ?? {}) as Record<string, unknown>)) });
      }
    }

    throw new HttpError(404, "bulunamadı");
  }
}
