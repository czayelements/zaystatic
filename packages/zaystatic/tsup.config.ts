import { defineConfig } from "tsup";

/* Üç giriş: sunucu çekirdeği, Next uyarlayıcısı, tarayıcı arayüzü. `schema` düz ESM olarak kopyalanır
   (scripts/copy-assets.mjs): Node betikleri de içe aktarabilsin diye derlenmez. */
const shared = {
  format: ["esm" as const],
  target: "es2022",
  dts: true,
  sourcemap: true,
  treeshake: true,
};

export default defineConfig([
  { ...shared, entry: { index: "src/index.ts", next: "src/next/index.ts", node: "src/node/index.ts" }, platform: "node", clean: false },
  {
    ...shared,
    entry: { ui: "src/ui/index.ts" },
    platform: "browser",
    clean: false,
  },
]);
