// vite-plugin-salla.js
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import ws from "websocket";
import { execSync } from "child_process";
import { type Plugin } from "vite";
import { subscribe } from "@parcel/watcher";

const { client: wsclient } = ws;

type SallaCLIParams = {
  theme_id: number | undefined;
  draft_id: number | undefined;
  store_id: number | undefined;
  upload_url: string | undefined;
  wsport: number | undefined;
  sallaCli: "salla" | undefined;
  lastRequestTime: number | undefined;
};

export default function sallaVitePlugin(): Plugin {
  let params: SallaCLIParams = {
    theme_id: undefined,
    draft_id: undefined,
    store_id: undefined,
    upload_url: undefined,
    wsport: undefined,
    sallaCli: "salla",
    lastRequestTime: undefined,
  };
  let connection: ws.connection | null;
  let isConnected = false;
  let syncQueue: string[] = [];
  let isSyncing = false;

  const logger = (
    msg: string,
    type: "info" | "success" | "warning" | "error" | "debug"
  ) => {
    const map = new Map([
      ["info", 46],
      ["success", 42],
      ["warning", 43],
      ["error", 41],
      ["debug", 45],
    ]);

    if (type === "debug" && !process.env.DEBUG) return;

    const col = map.get(type)!;

    console.log(
      `\n\x1b[1m\x1b[${col}m SALLA VITE \x1b[0m \x1b[30m[${new Date().toLocaleTimeString()}]\x1b[0m \x1b[${
        col - 10
      }m${msg}\x1b[0m\n`
    );
  };

  // Load Salla CLI configuration
  const loadSallaConfig = () => {
    const cachePath = path.join(process.cwd(), "/node_modules/.salla-cli");
    if (fs.existsSync(cachePath)) {
      try {
        params = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        logger(
          `Loaded Salla config: Theme ID ${params.theme_id}, Store ID ${params.store_id}, Draft ID ${params.draft_id}`,
          "info"
        );
        return true;
      } catch (error) {
        logger(
          `Failed to parse Salla config: ${(error as Error).message}`,
          "error"
        );
        return false;
      }
    } else {
      logger(
        "Salla CLI config not found. Make sure to run 'salla theme preview' first.",
        "warning"
      );
      return false;
    }
  };

  // WebSocket connection management
  const connectWebSocket = () => {
    if (!params.wsport) {
      logger("WebSocket port not configured", "warning");
      return;
    }

    const client = new wsclient();

    client.on("connectFailed", (error) => {
      logger(`WebSocket connection failed: ${error.toString()}`, "error");
      isConnected = false;
      // Retry connection after 5 seconds
      setTimeout(connectWebSocket, 5000);
    });

    client.on("connect", (_connection) => {
      connection = _connection;
      isConnected = true;
      logger(
        `Connected to WebSocket on port ws://localhost:${params.wsport}`,
        "success"
      );

      // Process any queued sync operations
      if (syncQueue.length > 0) {
        logger(`Processing ${syncQueue.length} queued sync operations`, "info");
        processSyncQueue();
      }
    });

    // @ts-ignore
    client.on("close", () => {
      logger("WebSocket connection closed", "warning");
      isConnected = false;
      connection = null;
    });

    // @ts-ignore
    client.on("error", (error: Error) => {
      logger(`WebSocket error: ${error.toString()}`, "error");
      isConnected = false;
    });

    try {
      client.connect(`ws://localhost:${params.wsport}`, "echo-protocol");
    } catch (error) {
      logger(
        `Failed to connect to WebSocket: ${(error as Error).message}`,
        "error"
      );
    }
  };

  // Enhanced file sync with queue management
  const syncFile = async (filePath: string) => {
    if (!params.theme_id || !params.store_id || !params.draft_id) {
      logger("Missing required Salla configuration parameters", "error");
      return false;
    }

    const relativePath = path.relative(process.cwd(), filePath);
    logger(`Syncing file: ${relativePath}`, "info");

    try {
      const command = `${params.sallaCli} theme sync -f "${filePath}" -id ${params.theme_id} -store_id ${params.store_id} -draft_id ${params.draft_id} -upload_url ${params.upload_url}`;

      execSync(command, { stdio: "inherit" });

      logger(`Successfully synced: ${relativePath}`, "success");
      return true;
    } catch (error) {
      logger(
        `Failed to sync ${relativePath}: ${(error as Error).message}`,
        "error"
      );
      return false;
    }
  };

  // Queue management for sync operations
  const queueSync = (filePath: string) => {
    if (!syncQueue.find((item) => item === filePath)) {
      syncQueue.push(filePath);
      logger(`Queued sync for: ${filePath}`, "debug");
    }
  };

  const processSyncQueue = async () => {
    if (isSyncing || syncQueue.length === 0) return;

    isSyncing = true;
    logger(`Processing sync queue (${syncQueue.length} files)`, "info");

    while (syncQueue.length > 0) {
      const filePath = syncQueue.shift();
      await syncFile(filePath!);

      // Small delay between syncs to avoid overwhelming the server
      if (syncQueue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    isSyncing = false;

    // Send reload signal after all syncs are complete
    if (isConnected && connection) {
      connection.send(JSON.stringify({ msg: "reload" }));
      logger("Sent reload signal to preview", "info");
    }
  };

  const setupFileWatcher = async () => {
    let debounceTimers = new Map();

    try {
      await subscribe("src", (err, events) => {
        if (err) {
          logger(`Watcher error: ${err.message}`, "error");
          return;
        }

        events.forEach((event) => {
          const { type, path: filePath } = event;
          const ext = path.extname(filePath);

          if (ext === ".twig" || ext === ".json") {
            // Clear existing timer for this file
            if (debounceTimers.has(filePath)) {
              clearTimeout(debounceTimers.get(filePath));
            }

            // Set new timer for debouncing
            const timer = setTimeout(async () => {
              logger(`File ${type}: ${filePath}`, "info");
              if (isConnected) {
                // If WebSocket is connected, queue the sync
                queueSync(filePath);
                processSyncQueue();
              } else {
                // If WebSocket is not connected, sync immediately
                await syncFile(filePath);
              }

              debounceTimers.delete(filePath);
            }, 700); // 700ms debounce

            debounceTimers.set(filePath, timer);
          }
        });
      });

      logger("File Watcher initialized", "success");
    } catch (error) {
      logger(`Failed to setup watcher: ${(error as Error).message}`, "error");
    }
  };

  // Copy images to public directory
  const copyImages = async () => {
    const imagesPath = path.resolve("src/assets/images");
    const publicImagesPath = path.resolve("public/images");

    try {
      if (!fs.existsSync(imagesPath)) {
        logger("No images directory found", "debug");
        return;
      }

      await fsPromises.mkdir(publicImagesPath, { recursive: true });
      const files = await fsPromises.readdir(imagesPath);

      for (const file of files) {
        const sourcePath = path.join(imagesPath, file);
        const destPath = path.join(publicImagesPath, file);

        // Only copy if file doesn't exist or is newer
        try {
          const sourceStats = await fsPromises.stat(sourcePath);
          const destStats = await fsPromises.stat(destPath);

          if (sourceStats.mtime > destStats.mtime) {
            await fsPromises.copyFile(sourcePath, destPath);
            logger(`Copied image: ${file}`, "debug");
          }
        } catch (error) {
          // Destination doesn't exist, copy it
          await fsPromises.copyFile(sourcePath, destPath);
          logger(`Copied new image: ${file}`, "debug");
        }
      }
    } catch (error) {
      logger(`Failed to copy images: ${(error as Error).message}`, "error");
    }
  };

  // Ensure app.scss is imported in app.js
  const ensureAppScssImport = async () => {
    const appJsPath = path.resolve("src/assets/js/app.js");

    try {
      let appJsContent = await fsPromises.readFile(appJsPath, "utf-8");
      const importStatement = `import '../styles/app.scss';`;

      if (!appJsContent.includes("app.scss")) {
        const newContent = `${importStatement}\n${appJsContent}`;
        await fsPromises.writeFile(appJsPath, newContent);
        logger("Added app.scss import to app.js", "info");
      }
    } catch (error) {
      logger(`Error processing app.js: ${(error as Error).message}`, "error");
    }
  };

  return {
    name: "vite-plugin-salla",
    apply: "build",

    config() {
      // Load Salla configuration
      if (!loadSallaConfig()) {
        logger(
          "Salla configuration not available. Some features may not work.",
          "warning"
        );
      }

      // Setup WebSocket connection
      connectWebSocket();

      // Setup file watcher
      setupFileWatcher();

      // Define JavaScript entry points
      const jsEntries = {
        app: path.resolve("src/assets/js/app.js"),
        home: path.resolve("src/assets/js/home.js"),
        "product-card": path.resolve("src/assets/js/partials/product-card.js"),
        "main-menu": path.resolve("src/assets/js/partials/main-menu.js"),
        "wishlist-card": path.resolve(
          "src/assets/js/partials/wishlist-card.js"
        ),
        checkout: path.resolve("src/assets/js/cart.js"),
        pages: path.resolve("src/assets/js/loyalty.js"),
        product: path.resolve("src/assets/js/product.js"),
        order: path.resolve("src/assets/js/order.js"),
        testimonials: path.resolve("src/assets/js/testimonials.js"),
      };

      // Return Vite configuration
      return {
        build: {
          rollupOptions: {
            input: jsEntries,
            output: {
              entryFileNames: "[name].js",
              chunkFileNames: "[name].[hash].js",
              assetFileNames: (assetInfo) => {
                if (assetInfo.name?.endsWith(".css")) {
                  return "app.css";
                }
                return "[name].[ext]";
              },
            },
          },
          outDir: "public",
          emptyOutDir: true,
          manifest: false,
          cssCodeSplit: false,
          // Optimize build performance
          minify: "esbuild",
          target: "es2015",
          sourcemap: false,
        },
        css: {
          preprocessorOptions: {
            scss: {
              quietDeps: true,
              includePaths: ["src/assets/styles"],
              silenceDeprecations: ["import"],
            },
          },
        },
        optimizeDeps: {
          exclude: ["@salla.sa/twilight-components"],
        },
        // Development server configuration
        server: {
          port: 8000,
          host: true,
          cors: true,
        },
        // Watch configuration
        watch: {
          ignored: ["node_modules/**", "public/**"],
        },
      };
    },

    async buildStart() {
      logger("Build started", "info");
      await ensureAppScssImport();
    },

    buildEnd() {
      logger("Build completed", "success");

      // Send reload signal after build
      if (isConnected && connection) {
        connection.send(JSON.stringify({ msg: "reload" }));
        logger("Sent reload signal after build", "info");
      }
    },

    async writeBundle() {
      await copyImages();
    },

    // Handle twilight.js exclusion
    load(id) {
      if (id.includes("twilight.js")) {
        return {
          code: "// twilight.js is excluded from bundling",
          map: null,
        };
      }
    },

    // Cleanup on plugin close
    closeBundle() {
      logger("Plugin cleanup completed", "info");
    },
  };
}
