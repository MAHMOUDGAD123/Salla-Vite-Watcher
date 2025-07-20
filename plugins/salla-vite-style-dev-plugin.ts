import type { Plugin, UserConfig } from "vite";
import {
  removeCssCommentsPlugin,
  useOriginalAssetsNamesPlugin,
} from "./utils/helper-plugins.ts";
import { GLOBAL_VITE_CONFIG } from "./utils/globals.ts";
import { formatFileSize, logger, Timer } from "./utils/tools.ts";

const getConfig = ({
  entries,
}: {
  entries: ViteStyleRollupEntries;
}): Omit<UserConfig, "plugins"> => {
  return {
    ...GLOBAL_VITE_CONFIG,
    mode: "development",
    build: {
      outDir: "public",
      emptyOutDir: false,
      minify: "terser",
      target: "ESNext",
      terserOptions: {
        format: {
          comments: false,
        },
      },
      rollupOptions: {
        input: entries,
        output: {
          entryFileNames: "[name].css",
          assetFileNames: "[name].css",
        },
        plugins: [removeCssCommentsPlugin(), useOriginalAssetsNamesPlugin()],
      },
    },
  };
};

/**
 * Vite plugin to mirror src/assets/styles -> public/styles
 * for development builds, preserving structure and file names.
 */
export function mirrorStylesPlugin({
  entries,
}: {
  entries: ViteStyleRollupEntries;
}): Plugin {
  return {
    name: "mirror-styles-plugin",

    config() {
      return getConfig({ entries });
    },
  };
}

export const sallaViteStylePlugin = ({
  rollupEntry,
  rollupEntryName,
  logDetails,
}: SallaViteStylePluginConfig): Plugin => {
  let timer: Timer;
  const rollupEntryString = `[${rollupEntryName}]`;

  return {
    name: "salla-vite-style-plugin",

    config() {
      return getConfig({ entries: rollupEntry });
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

        // Calculate sizes for all files in the bundle
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
  };
};
