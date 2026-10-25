export type MediaEntry = { key: string; url: string; size?: number; modified?: string };

export type ServerIssue = { locale: string; path: (string | number)[]; code: string; params?: Record<string, unknown> };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: ServerIssue[],
  ) {
    super(message);
  }
}

export type Api = ReturnType<typeof createApi>;

export function createApi(base: string) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: { "x-zay-request": "1", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; issues?: ServerIssue[] };
    if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`, data.issues);
    return data as T;
  }
  /** Uploads a file (multipart); returns its public URL. */
  async function upload(file: File): Promise<{ url: string }> {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${base}/media`, { method: "POST", credentials: "same-origin", headers: { "x-zay-request": "1" }, body });
    const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
    if (!res.ok || !data.url) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
    return { url: data.url };
  }
  return {
    base,
    upload,
    mediaList: (cursor?: string) =>
      request<{ items: MediaEntry[]; next?: string }>("GET", `/media?limit=48${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    mediaDelete: (key: string) => request<{ ok: boolean }>("DELETE", `/media?key=${encodeURIComponent(key)}`),
    get: <T,>(path: string) => request<T>("GET", path),
    post: <T,>(path: string, body: unknown) => request<T>("POST", path, body),
    put: <T,>(path: string, body: unknown) => request<T>("PUT", path, body),
    del: <T,>(path: string) => request<T>("DELETE", path),
  };
}
