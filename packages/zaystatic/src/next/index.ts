import { createHandler } from "../core/api";
import { resolveMode } from "../core/auth";
import type { ZayConfig } from "../core/types";

/**
 * Whether the panel is open for this deployment. In production without the ZAY_* settings it is
 * closed and its endpoints answer 404; call `notFound()` from the panel page the same way:
 *
 *   if (!isPanelOpen(config)) notFound();
 */
export function isPanelOpen(config: ZayConfig): boolean {
  return resolveMode(config) !== "unconfigured";
}

/**
 * Next.js route handlers. `app/api/zay/[...path]/route.ts`:
 *
 *   export const runtime = "nodejs";
 *   export const dynamic = "force-dynamic";
 *   export const { GET, POST, PUT, DELETE } = createNextHandlers(config);
 */
export function createNextHandlers(config: ZayConfig) {
  const handle = createHandler(config);
  const run = (request: Request) => handle(request);
  return { GET: run, POST: run, PUT: run, DELETE: run };
}
