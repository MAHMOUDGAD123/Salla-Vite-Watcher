import path from "path";
import type { UserConfig } from "vite";

export const _src = (file?: string) =>
  path.resolve("src", file || "").replaceAll("\\", "/");
export const _assets = (file?: string) =>
  path.resolve("src/assets", file || "").replaceAll("\\", "/");
export const _public = (file?: string) =>
  path.resolve("public", file || "").replaceAll("\\", "/");

export const SRC = _src();
export const SRC_IMGS = _assets("images");
export const SRC_STYLES = _assets("styles");
export const SRC_STYLES_APP = _assets("styles/app.scss");

export const PUBLIC = _public();
export const PUBLIC_IMGS = _public("images");
export const PUBLIC_STYLES_APP = _public("app.css");

export const SALLA_VITE_ROLLUP_ENTRIES_PROD: ViteRollupEntries = {
  style: _assets("styles/app.scss"), // will be app.css after vite build not style.css
  app: _assets("js/_output/app.js"),
  home: _assets("js/_output/home.js"),
  "product-card": _assets("js/_output/product-card.js"),
  "main-menu": _assets("js/_output/main-menu.js"),
  "wishlist-card": _assets("js/_output/wishlist-card.js"),
  checkout: _assets("js/_output/checkout.js"),
  pages: _assets("js/_output/pages.js"),
  product: _assets("js/_output/product.js"),
  order: _assets("js/_output/order.js"),
  testimonials: _assets("js/_output/testimonials.js"),
};

export const EXT_TYPE_HASH: Record<FileExtensionType, ExtensionType> = {
  // script
  ".cjs": "script",
  ".js": "script",
  ".mjs": "script",
  ".mts": "script",
  ".ts": "script",
  // style
  ".css": "style",
  ".sass": "style",
  ".scss": "style",
  // json
  ".json": "json",
  // twig
  ".twig": "twig",
};

export const GLOBAL_VITE_CONFIG: Omit<UserConfig, "plugins"> = {
  publicDir: false,
  logLevel: "error",
  // ESBuild configuration for better performance
  esbuild: {
    format: "esm",
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
  },
  // CSS configuration
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true,
        loadPaths: ["src/assets/styles"],
        silenceDeprecations: ["import"],
      },
    },
  },
  // Optimize dependencies
  optimizeDeps: {
    include: ["animejs", "sweetalert2", "fslightbox"],
    exclude: ["@salla.sa/twilight-components"],
  },
  // Resolve configuration
  resolve: {
    alias: {
      "@plugins": "/plugins",
      "@": "/src",
      "@assets": "/src/assets",
      "@styles": "/src/assets/styles",
      "@js": "/src/assets/js",
      "@images": "/src/assets/images",
    },
  },
};

/**
 * - This map will hold all the salla script entries as a key mapped with all dependencies for each entry as a Set of (PilePath).
 * - This map will be used as a reference to figure out if any updated dependency should trigger a reload for it's salla entry ot not?.
 * - And each entry will udpate it's dependencies during any rebuild happen for this entry.
 * @example "app" => Set("/src/assets/js/partials/anime.js", "/src/assets/js/partials/main-menu.js")
 * @example "home" => Set("src/assets/js/home.js", "src/assets/js/base-page.js")
 */
export const scriptEntriesDepsMap: Record<SallaScriptEntryName, Set<FilePath>> = {
  app: new Set(),
  checkout: new Set(),
  home: new Set(),
  order: new Set(),
  pages: new Set(),
  product: new Set(),
  testimonials: new Set(),
  "main-menu": new Set(),
  "product-card": new Set(),
  "wishlist-card": new Set(),
};

/**
 * - This map is the opposite to (scriptEntriesDepsMap).
 * - This map will hold all the dependencies as a key mapped with all entries that depends on it as a Set of (SallaEntryName).
 * @example "src/assets/js/base-page.js" => Set("home", "order", "product")
 * @example "src/assets/js/app.js" => Set("app")
 */
export const scriptDepsEntriesMap: Record<FilePath, Set<SallaScriptEntryName>> = {};
