import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

import type { Change, Store } from "./types";

/** Yerel dosya sistemi: `pnpm dev` ve yerelde panel. Kök dışına çıkış yok. */
export function fsStore(root: string): Store {
  const abs = (path: string) => {
    const full = normalize(join(root, path));
    if (full !== root && !full.startsWith(root + sep)) throw new Error(`geçersiz yol: ${path}`);
    return full;
  };

  return {
    kind: "fs",
    async list(dir) {
      try {
        const entries = await readdir(abs(dir), { withFileTypes: true });
        return entries.filter((e) => e.isFile() && !e.name.startsWith(".")).map((e) => e.name);
      } catch {
        return [];
      }
    },
    async read(path) {
      try {
        return await readFile(abs(path), "utf8");
      } catch {
        return null;
      }
    },
    async commit(changes: Change[]) {
      for (const change of changes) {
        const file = abs(change.path);
        if (change.content === null) {
          await rm(file, { force: true });
          continue;
        }
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, change.encoding === "base64" ? Buffer.from(change.content, "base64") : change.content);
      }
      return {};
    },
  };
}
