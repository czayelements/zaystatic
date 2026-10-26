import { createNextHandlers } from "zaystatic/next";

import config from "@/zaystatic.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST, PUT, DELETE } = createNextHandlers(config);
