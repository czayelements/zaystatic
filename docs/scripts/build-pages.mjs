// Static export of the docs for GitHub Pages. The panel (app/zaystatic) and its
// API (app/api) run on a server, so they are moved out of app/ for this build
// and put back afterwards, even when the build fails.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";

const aside = ".pages-aside";
const moved = ["app/zaystatic", "app/api"];

mkdirSync(aside, { recursive: true });
for (const dir of moved) if (existsSync(dir)) renameSync(dir, `${aside}/${dir.replace("app/", "")}`);

let status = 1;
try {
  rmSync(".next", { recursive: true, force: true });
  status = spawnSync("pnpm", ["exec", "next", "build"], {
    stdio: "inherit",
    env: { ...process.env, ZAYSTATIC_EXPORT: "1" },
  }).status ?? 1;
} finally {
  for (const dir of moved) if (existsSync(`${aside}/${dir.replace("app/", "")}`)) renameSync(`${aside}/${dir.replace("app/", "")}`, dir);
  rmSync(aside, { recursive: true, force: true });
  rmSync(".next", { recursive: true, force: true });
}
process.exit(status);
