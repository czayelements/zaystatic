import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

import type { Change, Store } from "./types";

/** Local file system: for `dev` and local panel use. Cannot leave its root. */
export function fsStore(root: string): Store {
  const abs = (path: string) => {
    const full = normalize(join(root, path));
    if (full !== root && !full.startsWith(root + sep)) throw new Error(`invalid path: ${path}`);
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
    async listTree(dir) {
      const out: string[] = [];
      const walk = async (rel: string) => {
        let entries;
        try {
          entries = await readdir(abs(rel), { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          if (e.name.startsWith(".")) continue;
          const child = `${rel}/${e.name}`;
          if (e.isDirectory()) await walk(child);
          else if (e.isFile()) out.push(child);
        }
      };
      await walk(dir.replace(/\/$/, ""));
      return out;
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
