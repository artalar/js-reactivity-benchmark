import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts", "src/worker.ts", "src/reatom-profile.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  sourcemap: "external",
});
