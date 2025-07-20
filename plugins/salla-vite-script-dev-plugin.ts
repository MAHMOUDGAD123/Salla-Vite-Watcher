import type { Plugin } from "vite";
import { removeCssCommentsPlugin } from "./utils/helper-plugins.ts";
import {
  formatFileSize,
  isFileInsideFolder,
  logger,
  relativePath,
  Timer,
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
  let timer: Timer;
  const oldEntriesDepsMap = structuredClone(
    scriptEntriesDepsMap[rollupEntryName]
  );
  clearScriptEntriesDeps(rollupEntryName); // Clear the entriesDeps first to add the new deps to it 😎.
  const rollupEntryString = `[${rollupEntryName}]`;

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
            plugins: [removeCssCommentsPlugin()],
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

    buildStart() {
      if (logDetails) {
        timer = new Timer();
      }
    },

    generateBundle(_, bundle) {
      if (logDetails && bundle) {
        const duration = timer.duration;
        let totalSize = 0;
        const fileSizes: Array<{ name: string; size: string; bytes: number }> =
          [];

        // Calc sizes for all files in the bundle
        for (const [fileName, file] of Object.entries(bundle)) {
          if (file.type === "chunk" || file.type === "asset") {
            const bytes =
              file.type === "chunk"
                ? Buffer.byteLength(file.code || "", "utf8")
                : Buffer.byteLength(file.source || "", "utf8");

            totalSize += bytes;
            fileSizes.push({
              name: fileName,
              size: formatFileSize(bytes),
              bytes,
            });
          }
        }

        // Log total bundle size
        logger(
          `Bundle ${rollupEntryString} -> (${formatFileSize(
            totalSize
          )}) | (${duration})`,
          "debug"
        );
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
