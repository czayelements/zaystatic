import { defineConfig, repoMedia } from "zaystatic";

import schema from "./zaystatic.schema";

export default defineConfig({
  name: "zaystatic docs",
  basePath: "/zaystatic",
  apiPath: "/api/zaystatic",
  locales: ["en"],
  defaultLocale: "en",
  language: "en",
  repo: { owner: "czaydev", name: "zaystatic", branch: "main" },
  media: { adapter: repoMedia({ dir: "docs/public/uploads", urlPrefix: "/uploads" }) },
  schema,
});
