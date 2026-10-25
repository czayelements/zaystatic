import { createHandler } from "../core/api";
import type { ZayConfig } from "../core/types";

/**
 * Next.js route handler'ları. `app/api/zay/[...path]/route.ts`:
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
