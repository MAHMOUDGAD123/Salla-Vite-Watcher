import type { Plugin } from "vite";
import { formatFileSize } from "./utils/tools.ts";
import { removeCssCommentsPlugin } from "./utils/helper-plugins.ts";
import { GLOBAL_VITE_CONFIG } from "./utils/globals.ts";
import { Logger } from "./utils/logger.ts";

export const sallaViteProductionPlugin = ({
  rollupEntry,
  rollupEntryName,
}: SallaViteProductionPluginConfig): Plugin => {
  const rollupEntryString = `[${rollupEntryName}]`;

  return {
    name: "salla-vite-production-plugin",

    config() {
      return {
        ...GLOBAL_VITE_CONFIG,
        mode: "production",
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
            plugins: [removeCssCommentsPlugin()],
            input: rollupEntry,
            output: {
              inlineDynamicImports: true, // force inline chunks (only one entry needed)
              manualChunks: undefined,
              entryFileNames: "[name].js",
              chunkFileNames: "[name].js",
              assetFileNames: (assetInfo) => {
                return assetInfo.names.some((name) => name === "style.css")
                  ? "app.css"
                  : "[name].[ext]";
              },
            },
          },
        },
      };
    },

    load(filePath) {
      // Kick twilight.js from bundling 🐂💩
      if (filePath.includes("twilight.js")) {
        return {
          code: "// twilight.js is excluded from bundling because it's very biggg",
          map: null,
        };
      }
    },

    generateBundle(_, bundle) {
      if (bundle) {
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
        Logger.info(
          `Bundle ${rollupEntryString} -> (${formatFileSize(totalSize)})`
        );
      }
    },
  };
};
