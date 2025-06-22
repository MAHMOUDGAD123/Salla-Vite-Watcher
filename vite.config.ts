import { defineConfig } from "vite";
import sallaPlugin from "./plugins/vite-plugin-salla";

export default defineConfig(({ mode }) => ({
  plugins: [sallaPlugin()],
  publicDir: false,

  // Build configuration
  build: {
    mode: mode || "development",
    watch:
      mode === "development"
        ? {
            // Watch for changes in source files
            include: ["src/**"],
            exclude: ["node_modules/**", "public/**"],
          }
        : null,
    minify: "esbuild",
    target: "es2015",
    sourcemap: mode === "development",
    rollupOptions: {
      // Optimize chunk splitting
      output: {
        manualChunks: {
          // vendor: ["animejs", "sweetalert2", "fslightbox"],
          // twilight: ["@salla.sa/twilight-components"],
        },
      },
    },
  },

  // Development server configuration
  server: {
    port: 8000,
    host: true,
    cors: true,
    // Enable HMR for better development experience
    hmr: {
      port: 8001,
      protocol: "ws",
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ["animejs", "sweetalert2", "fslightbox"],
    exclude: ["@salla.sa/twilight-components"],
  },

  // ESBuild configuration for better performance
  esbuild: {
    format: "esm",
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
    target: "es2015",
  },

  // CSS configuration
  css: {
    devSourcemap: mode === "development",
    preprocessorOptions: {
      scss: {
        quietDeps: true,
        includePaths: ["src/assets/styles"],
        silenceDeprecations: ["import"],
      },
    },
  },

  // Define global constants
  define: {
    __DEV__: mode === "development",
    __PROD__: mode === "production",
  },

  // Resolve configuration
  resolve: {
    alias: {
      "@": "/src",
      "@assets": "/src/assets",
      "@styles": "/src/assets/styles",
      "@js": "/src/assets/js",
      "@images": "/src/assets/images",
    },
  },
}));
