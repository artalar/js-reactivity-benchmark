import { libraryVersions } from "../node/src/versions";
import { frameworkMetadata } from "../core/src/frameworkMetadata";
import { defineConfig } from "vite";

const versions = libraryVersions(
  frameworkMetadata,
  new URL("../core/package.json", import.meta.url),
  new URL("../core/src/", import.meta.url),
);

export default defineConfig({
  worker: { format: "es" },
  define: {
    ngDevMode: "false",
    __LIBRARY_VERSIONS__: JSON.stringify(versions),
  },
  build: {
    sourcemap: true,
    rolldownOptions: {
      output: {
        minify: {
          mangle: false,
          codegen: {
            removeWhitespace: false,
          },
        },
      },
    },
  },
});
