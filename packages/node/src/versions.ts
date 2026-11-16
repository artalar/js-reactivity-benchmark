import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export function libraryVersions(
  entries: readonly { name: string; package: string; adapter: string }[],
  corePackage: URL,
  coreSource: URL,
): Record<string, string> {
  const require = createRequire(corePackage);
  return Object.fromEntries(
    entries.map((entry) => {
      try {
        const source = readFileSync(new URL(entry.adapter, coreSource), "utf8");
        const local = source.match(
          /from\s+["']((?:\.\.\/){3,}[^"']+)["']/,
        )?.[1];
        if (local) return [entry.name, `local checkout (${local})`];
      } catch {}
      try {
        let path = dirname(require.resolve(entry.package));
        for (let depth = 0; depth < 12; depth++) {
          try {
            const value: unknown = JSON.parse(
              readFileSync(join(path, "package.json"), "utf8"),
            );
            if (
              typeof value === "object" &&
              value !== null &&
              "name" in value &&
              value.name === entry.package &&
              "version" in value &&
              typeof value.version === "string"
            )
              return [entry.name, value.version];
          } catch {}
          const parent = dirname(path);
          if (parent === path) break;
          path = parent;
        }
      } catch {}
      return [entry.name, "unknown"];
    }),
  );
}
