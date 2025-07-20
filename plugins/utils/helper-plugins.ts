import type { Rollup } from "vite";

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

export const useOriginalAssetsNamesPlugin = (): Rollup.Plugin => {
  return {
    name: "original-assets-names",

    generateBundle(_, bundle) {
      const testReg = /\d+\.css$/;

      Object.keys(bundle).forEach((fileName) => {
        type FileType = {
          fileName: string;
          name: string;
          names: string[];
          needsCodeReference: boolean;
          originalFileName: string;
          originalFileNames: string[];
          source: string;
          type: string;
        };

        const file = bundle[fileName]!;

        // Check if it's a CSS file with unwanted numbering
        if (testReg.test(fileName)) {
          const fileInfo = file as FileType;
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
