import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

import { createHandler } from "../core/api";
import type { ZayConfig } from "../core/types";

/**
 * Adapter for Node's `http` server and everything built on it (Express, Fastify
 * via `raw`, Connect, …). It turns the incoming message into a Web `Request`,
 * runs the handler and writes the `Response` back.
 *
 *   app.use("/api/cms", createNodeHandler(config));          // Express
 *   http.createServer(createNodeHandler(config)).listen(3000); // plain Node
 *
 * The handler matches on `config.apiPath`, so mount it where that path points.
 */
export function createNodeHandler(config: ZayConfig) {
  const handle = createHandler(config);

  return async function nodeHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    /* Express strips the mount path from `req.url`; `originalUrl` keeps it. */
    const path = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? "/";
    const proto = String(req.headers["x-forwarded-proto"] ?? ("encrypted" in req.socket ? "https" : "http")).split(",")[0];
    const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost").split(",")[0];

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      else if (value !== undefined) headers.set(key, value);
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(`${proto}://${host}${path}`, {
      method: req.method,
      headers,
      ...(hasBody ? { body: Readable.toWeb(req) as unknown as ReadableStream, duplex: "half" } : {}),
    } as RequestInit);

    const response = await handle(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key !== "set-cookie") res.setHeader(key, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("set-cookie", cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}
