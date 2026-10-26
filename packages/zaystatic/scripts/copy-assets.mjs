import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });
copyFileSync("src/ui/zay.css", "dist/styles.css");
copyFileSync("src/schema/dsl.mjs", "dist/schema.mjs");
copyFileSync("src/schema/dsl.d.mts", "dist/schema.d.mts");
console.log("[zaystatic] assets copied");

/* Next.js: the UI is a client component. esbuild drops the directive while bundling, so it is prepended after the build. */
const ui = readFileSync("dist/ui.js", "utf8");
if (!ui.startsWith('"use client"')) writeFileSync("dist/ui.js", `"use client";\n${ui}`);
