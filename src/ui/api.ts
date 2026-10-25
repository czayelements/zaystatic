export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
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
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
    return data as T;
  }
  /** Dosya yükler (multipart); herkese açık adresi döner. */
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
    get: <T,>(path: string) => request<T>("GET", path),
    post: <T,>(path: string, body: unknown) => request<T>("POST", path, body),
    put: <T,>(path: string, body: unknown) => request<T>("PUT", path, body),
    del: <T,>(path: string) => request<T>("DELETE", path),
  };
}
