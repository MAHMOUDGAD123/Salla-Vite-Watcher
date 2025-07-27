import type { Plugin } from "vite";
import {
  logBundleDetailsPlugin,
  removeCssCommentsPlugin,
} from "./utils/helper-plugins.ts";
import {
  isFileInsideFolder,
  relativePath,
} from "./utils/tools.ts";
import {
  scriptDepsEntriesMap,
  scriptEntriesDepsMap,
  GLOBAL_VITE_CONFIG,
  SRC,
} from "./utils/globals.ts";
import {
  addToScriptDepsEntries,
  addToScriptEntriesDeps,
  clearScriptEntriesDeps,
} from "./utils/build-tools.ts";

export const sallaViteScriptPlugin = ({
  rollupEntry,
  rollupEntryName,
  logDetails,
}: SallaViteScriptPluginConfig): Plugin => {
  const oldEntriesDepsMap = structuredClone(
    scriptEntriesDepsMap[rollupEntryName]
  );
  clearScriptEntriesDeps(rollupEntryName); // Clear the entriesDeps first to add the new deps to it 😎.

  return {
    name: "salla-vite-script-plugin",

    config() {
      return {
        ...GLOBAL_VITE_CONFIG,
        mode: "development",
        build: {
          outDir: "public",
          emptyOutDir: false,
          target: "ESNext",
          minify: "terser",
          terserOptions: {
            format: {
              comments: false,
            },
          },
          rollupOptions: {
            input: rollupEntry,
            output: {
              inlineDynamicImports: true, // force inline chunks (only one entry needed)
              manualChunks: undefined,
              entryFileNames: "[name].js",
              chunkFileNames: "[name].js",
            },
            plugins: [
              removeCssCommentsPlugin(),
              logBundleDetailsPlugin({
                rollupEntryName,
                logDetails: logDetails!,
              }),
            ],
          },
        },
      };
    },

    load(filePath) {
      // To ignore file outside the /src dir
      if (isFileInsideFolder(filePath, SRC)) {
        const relPath = relativePath("src", filePath);
        addToScriptEntriesDeps(relPath, rollupEntryName);
        addToScriptDepsEntries(relPath, rollupEntryName);
      }
      // Kick twilight.js from bundling 🐂💩
      if (filePath.includes("twilight.js")) {
        return {
          code: "// twilight.js is excluded from bundling because it's very biggg",
          map: null,
        };
      }
    },

    closeBundle() {
      // If any change happen in this entry after the rebuild
      // get the removed depencencies and then remove the entry from it's entries Set
      // to ignore unused rebuilds
      const _new = scriptEntriesDepsMap[rollupEntryName];
      const _old = oldEntriesDepsMap;
      const diffs = _old.difference(_new);

      if (diffs.size !== 0) {
        diffs.forEach((dep) => {
          scriptDepsEntriesMap[dep]?.delete(rollupEntryName);
        });
      }
    },
  };
};
