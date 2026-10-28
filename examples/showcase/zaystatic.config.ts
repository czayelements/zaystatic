import { defineConfig, repoMedia } from "@czayelements/zaystatic";

import schema from "./zaystatic.schema";

export default defineConfig({
  name: "Example: page builder",
  basePath: "/",
  apiPath: "/api/zaystatic",
  locales: ["tr", "en", "es", "de"],
  defaultLocale: "tr",
  localeNames: { tr: "Türkçe", en: "English", es: "Español", de: "Deutsch" },
  language: "en",
  repo: { owner: "czayelements", name: "zaystatic", branch: "main", pathPrefix: "examples/showcase" },
  media: { adapter: repoMedia({ dir: "public/uploads", urlPrefix: "/uploads" }) },
  schema,
});
