import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });
copyFileSync("src/ui/zay.css", "dist/styles.css");
copyFileSync("src/schema/dsl.mjs", "dist/schema.mjs");
copyFileSync("src/schema/dsl.d.mts", "dist/schema.d.mts");
console.log("[zay-static] assets copied");

/* Next.js: arayüz istemci bileşenidir. esbuild paketlerken yönergeyi attığı için derlemeden sonra başa ekleniyor. */
const ui = readFileSync("dist/ui.js", "utf8");
if (!ui.startsWith('"use client"')) writeFileSync("dist/ui.js", `"use client";\n${ui}`);
