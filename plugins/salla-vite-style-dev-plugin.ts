import type { Plugin, UserConfig } from "vite";
import {
  logBundleDetailsPlugin,
  removeCssCommentsPlugin,
  useOriginalAssetsNamesPlugin,
} from "./utils/helper-plugins.ts";
import { GLOBAL_VITE_CONFIG } from "./utils/globals.ts";

const getConfig = ({
  entries,
  rollupEntryName,
  logDetails,
}: {
  entries: Record<string, string>;
  rollupEntryName: string;
  logDetails: boolean;
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
        plugins: [
          removeCssCommentsPlugin(),
          useOriginalAssetsNamesPlugin(),
          logBundleDetailsPlugin({
            rollupEntryName,
            logDetails: logDetails!,
          }),
        ],
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
      return getConfig({ entries, rollupEntryName: "", logDetails: false });
    },
  };
}

export const sallaViteStylePlugin = ({
  rollupEntry,
  rollupEntryName,
  logDetails,
}: SallaViteStylePluginConfig): Plugin => {
  return {
    name: "salla-vite-style-plugin",

    config() {
      return getConfig({
        entries: rollupEntry,
        rollupEntryName,
        logDetails: logDetails!,
      });
    },
  };
};
