import type { Rollup } from "vite";
import { formatFileSize, Timer } from "./tools.ts";
import { Logger } from "./logger.ts";

export const removeCssCommentsPlugin = (): Rollup.Plugin => {
  return {
    name: "strip-css-comments",

    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === "asset" && file.fileName.endsWith(".css")) {
          file.source = file.source.toString().replace(/\/\*[\s\S]*?\*\//g, "");
        }
      }
    },
  };
};

type FileType = {
  fileName: string;
  name: string;
  names: string[];
  needsCodeReference: boolean;
  originalFileName: string;
  originalFileNames: string[];
  source: string;
  type: "asset" | "chunk";
};

export const useOriginalAssetsNamesPlugin = (): Rollup.Plugin => {
  return {
    name: "use-original-assets-names",

    generateBundle(_, bundle) {
      Object.keys(bundle).forEach((fileName) => {
        const file = bundle[fileName]!;
        const fileInfo = file as FileType;

        // Only if the file is asset
        if (fileInfo.type === "asset") {
          // Get the original name of the file before rollup add the numeric suffix
          const originalFileName = fileInfo.names[0]!;

          // Update the fileName property if it exists
          if ("fileName" in file) {
            file.fileName = originalFileName;
          }
        }
      });
    },
  };
};

export const logBundleDetailsPlugin = ({
  rollupEntryName,
  logDetails,
}: {
  rollupEntryName: string;
  logDetails: boolean;
}): Rollup.Plugin => {
  let timer: Timer;
  const rollupEntryString = `[${rollupEntryName}]`;

  return {
    name: "log-bundle-details",

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
        Logger.debug(
          `Bundle ${rollupEntryString} -> (${formatFileSize(
            totalSize
          )}) | (${duration})`
        );
      }
    },
  };
};
