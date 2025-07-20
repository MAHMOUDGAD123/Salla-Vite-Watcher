import { type FSWatcher, watch } from "chokidar";
import { build } from "vite";
import chokidar from "chokidar";
import path from "path";
import fs, { promises as fsPromises } from "fs";
import WebSocket from "ws";
import { exec } from "child_process";
import { sallaViteScriptPlugin } from "./salla-vite-script-dev-plugin.ts";
import {
  logger,
  relativePath,
  waitFor,
  clearFolder,
  copyDir,
  Timer,
} from "./utils/tools.ts";
import {
  _assets,
  EXT_TYPE_HASH,
  PUBLIC,
  PUBLIC_IMGS,
  PUBLIC_STYLES_APP,
  SALLA_VITE_ROLLUP_ENTRIES_PROD,
  SRC,
  SRC_IMGS,
  SRC_STYLES,
  SRC_STYLES_APP,
} from "./utils/globals.ts";
import {
  excuteInParallel,
  generateRollupEntries,
  getScriptFileRebuildEntries,
} from "./utils/build-tools.ts";
import { sallaViteProductionPlugin } from "./salla-vite-prod-plugin.ts";
import {
  mirrorStylesPlugin,
  sallaViteStylePlugin,
} from "./salla-vite-style-dev-plugin.ts";

export class SallaViteBuilder {
  private readonly webSocketReconnetTrials = 2; // times
  private readonly webSocketReconnetInterval = 5000; // ms
  private readonly syncDebounce = 500; // ms
  private isScriptBuilding = false;
  private isStyleBuilding = false;
  private currentScriptBuildEntries: Set<SallaScriptEntryName> = new Set();
  private currentStyleBuildEntries: Set<SallaStyleEntryName> = new Set();
  private deferedScriptBuildsMap: Map<
    SallaScriptEntryName,
    DeferedScriptBuild
  > = new Map();
  private deferedStyleBuildsMap: Map<SallaStyleEntryName, DeferedStyleBuild> =
    new Map();
  private watcher: FSWatcher | null = null;
  private imageWatcher: FSWatcher | null = null;
  private connection: WebSocket | null = null;
  private isConnected = false;
  private syncQueue: SyncQueueItem[] = [];
  private isSyncing = false;
  private syncDebounceTimers = new Map<string, NodeJS.Timeout>();
  private params: SallaCliParams = {
    theme_id: undefined,
    draft_id: undefined,
    store_id: undefined,
    upload_url: undefined,
    wsport: undefined,
    sallaCli: "salla",
    lastRequestTime: undefined,
  };
  // Vite rollup build entries
  private viteStylesRollupEntries: Record<string, string> = {};
  private readonly viteScriptRollupEntries: ViteScriptRollupEntries = {
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

  async copyImages() {
    await copyDir(SRC_IMGS, PUBLIC_IMGS);
  }

  // Load Salla CLI configuration
  private loadSallaConfig = () => {
    const cachePath = path.join(process.cwd(), "/node_modules/.salla-cli");
    if (fs.existsSync(cachePath)) {
      try {
        this.params = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        logger(
          `Loaded Salla config: Theme ID ${this.params.theme_id}, Store ID ${this.params.store_id}, Draft ID ${this.params.draft_id}`,
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

  private setupWebSocket(reconnectTrials: number) {
    // WebSocket connection management
    if (!this.params?.wsport || reconnectTrials <= 0) {
      logger(
        "WebSocket port not configured restart the preview to try again",
        "warning"
      );
      return;
    }

    try {
      this.connection = new WebSocket(
        `ws://localhost:${this.params.wsport}`,
        "echo-protocol"
      );

      this.connection.on("open", () => {
        this.isConnected = true;
        logger(
          `Connected to WebSocket on port ws://localhost:${this.params.wsport}`,
          "success"
        );

        // Process any queued sync operations
        if (this.syncQueue.length > 0) {
          logger(
            `Processing ${this.syncQueue.length} queued sync operations`,
            "info"
          );
          this.processSyncQueue();
        }
      });

      this.connection.on("error", () => {
        logger(`WebSocket connection failed`, "error");
        this.isConnected = false;
        // Retry connection after 5 seconds
        setTimeout(
          () => this.setupWebSocket(reconnectTrials - 1),
          this.webSocketReconnetInterval
        );
      });

      this.connection.on("close", () => {
        this.isConnected = false;
        this.connection = null;
        logger("WebSocket connection closed", "success");
      });
    } catch (error) {
      logger(`Failed to connect to WebSocket`, "error");
      console.error(error);
    }
  }

  /**
   * Get the needed entry for Vite Rollup build
   * @param rollupScriptEntryName target style entry name
   * @example "app" ==> get the app.js entry { app: ".../assets/js/output/app.js" }
   */
  private getScriptRollupEntryByName(
    rollupScriptEntryName: SallaScriptEntryName
  ): ViteScriptRollupEntry {
    const entryPath = this.viteScriptRollupEntries[rollupScriptEntryName];
    return { [rollupScriptEntryName]: entryPath } as ViteScriptRollupEntry;
  }

  /**
   * Get the needed entry for Vite Rollup build
   * @param rollupStyleEntryName target style entry name
   * @example "styles/01-settings/tailwind" ==> get the app.js entry { "styles/01-settings/tailwind": ".../assets/styles/01-settings/tailwind.scss" }
   */
  private getStyleRollupEntryByName(
    rollupStyleEntryName: SallaStyleEntryName
  ): ViteStyleRollupEntry | null {
    const entryPath = this.viteStylesRollupEntries[rollupStyleEntryName];

    if (!entryPath) {
      logger(
        `Entry [${rollupStyleEntryName}] doesn't exsist in the (viteStylesRollupEntries) - rebuild the style ignored`,
        "warning"
      );
      return null;
    }
    return { [rollupStyleEntryName]: entryPath } as ViteStyleRollupEntry;
  }

  private extractStlyeRollupEntryNameFromPath(filePath: string) {
    return `styles/${path
      .relative(SRC_STYLES, filePath)
      .replaceAll("\\", "/")}`.split(".")[0]!;
  }

  private async setupFileWatcher() {
    this.watcher = watch(SRC, {
      ignored: [
        /node_modules/,
        /public/,
        /[\\/]src[\\/]assets[\\/]images([\\/]|$)/, // ignore the /src/assets/images dir
      ],
      persistent: true,
      ignoreInitial: true,
    });

    const handleChange = async (file: string) => {
      logger(`File changed: (${relativePath("src", file)})`, "info");
      const extName = path.extname(file) as FileExtensionType;
      const extType = EXT_TYPE_HASH[extName];

      switch (extType) {
        case "twig": {
          /**
           * The tailwind entry name is forbidden to make it fast ⚡
           * so never change the tailwind stlye file path in the src/assets/style
           * just keep it in this path `src/assets/styles/01-settings/tailwind.scss`.
           */
          const rollupEntryName = "styles/01-settings/tailwind";
          const rollupEntry = this.getStyleRollupEntryByName(rollupEntryName);

          if (rollupEntry) {
            await excuteInParallel([
              this.buildStyleEntrySync({
                rollupEntry,
                rollupEntryName,
              }),
              this.synchronize(file),
            ]);
          } else {
            await this.synchronize(file);
          }
          await this.reloadPreview();
          break;
        }
        case "json": {
          await this.synchronize(file);
          await this.reloadPreview();
          break;
        }
        case "style": {
          const srcStylesAppFile = path.resolve("src/assets/styles/app.scss");

          if (srcStylesAppFile === file) {
            await this.buildStylesAppFile();
            await this.reloadPreview();
          } else {
            const rollupEntryName =
              this.extractStlyeRollupEntryNameFromPath(file);
            const rollupEntry = this.getStyleRollupEntryByName(rollupEntryName);

            if (rollupEntry) {
              await this.buildStyleEntrySync({
                rollupEntry,
                rollupEntryName,
              });
              await this.reloadPreview();
            }
          }
          break;
        }
        case "script": {
          const dependencyPath = relativePath("src", file);
          const buildEntries = getScriptFileRebuildEntries(dependencyPath);

          if (buildEntries && buildEntries.size !== 0) {
            const builds = [...buildEntries].map((entryName) => {
              return this.buildScriptEntrySync({
                rollupEntry: this.getScriptRollupEntryByName(entryName),
                rollupEntryName: entryName,
              });
            });
            await excuteInParallel(builds);
            await this.reloadPreview();
          } else {
            logger(
              `Rebuild ignored for this file [${dependencyPath}] - because it's not used by any entry`,
              "warning"
            );
          }
          break;
        }
      }
    };

    const handleAdd = async (file: string) => {
      logger(`File added: (${relativePath("src", file)})`, "info");
      const extName = path.extname(file) as FileExtensionType;
      const extType = EXT_TYPE_HASH[extName];

      switch (extType) {
        case "twig": {
          break;
        }
        case "json": {
          break;
        }
        case "style": {
          break;
        }
        case "script": {
          break;
        }
      }
    };

    const handleUnlink = async (file: string) => {
      logger(`File unlinked: (${relativePath("src", file)})`, "info");
      const extName = path.extname(file) as FileExtensionType;
      const extType = EXT_TYPE_HASH[extName];

      switch (extType) {
        case "twig": {
          break;
        }
        case "json": {
          break;
        }
        case "style": {
          break;
        }
        case "script": {
          break;
        }
      }
    };

    this.watcher
      .on("change", (file) => handleChange(file))
      .on("add", (file) => handleAdd(file))
      .on("unlink", (file) => handleUnlink(file))
      .on("error", (error) => {
        const err = error as Error;
        logger(`Failed to start /src watcher: (${err.message})`, "error");
        console.error(err);
      });
  }

  private async mirrorAndWatchImages() {
    // Copy images first
    await this.copyImages();
    const srcDir = SRC_IMGS;
    const destDir = PUBLIC_IMGS;
    this.imageWatcher = chokidar.watch(srcDir, {
      ignoreInitial: true,
      persistent: true,
    });

    const copyToDest = async (srcPath: string) => {
      const relPath = path.relative(srcDir, srcPath);
      const destPath = path.join(destDir, relPath);

      try {
        const timer = new Timer();
        await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
        await fsPromises.copyFile(srcPath, destPath);
        logger(
          `Copy (${relativePath("src", srcPath)}) to (public/images) in {${
            timer.duration
          }}`,
          "debug"
        );
      } catch (err) {
        logger(
          `Failed to copy (${relativePath("src", srcPath)}) to (public/images)`,
          "error"
        );
      }
    };

    const removeFromDest = async (srcPath: string) => {
      const relPath = path.relative(srcDir, srcPath);
      const destPath = path.join(destDir, relPath);

      try {
        const timer = new Timer();
        await fsPromises.unlink(destPath);
        logger(
          `Unlink (${relativePath("src", srcPath)}) from (public/images) in {${
            timer.duration
          }}`,
          "debug"
        );
      } catch (e) {
        // File might not exist, ignore
        logger(
          `Failed to unlink (${relativePath(
            "src",
            srcPath
          )}) from (public/images)`,
          "error"
        );
      }
    };

    const mkdirInDest = async (srcPath: string) => {
      const relPath = path.relative(srcDir, srcPath);
      const destPath = path.join(destDir, relPath);

      try {
        const timer = new Timer();
        await fsPromises.mkdir(destPath, { recursive: true });
        logger(
          `Copy dir (${relativePath("src", srcPath)}) to (public/images) in {${
            timer.duration
          }}`,
          "debug"
        );
      } catch (err) {
        logger(
          `Failed to copy dir (${relativePath(
            "src",
            srcPath
          )}) to (public/images)`,
          "error"
        );
      }
    };

    const removeDirFromDest = async (srcPath: string) => {
      const relPath = path.relative(srcDir, srcPath);
      const destPath = path.join(destDir, relPath);

      try {
        const timer = new Timer();
        await fsPromises.rm(destPath, { recursive: true, force: true });
        logger(
          `Unlink dir (${relativePath(
            "src",
            srcPath
          )}) from (public/images) in {${timer.duration}}`,
          "debug"
        );
      } catch (e) {
        // Directory might not exist, ignore
        logger(
          `Failed to unlink dir (${relativePath(
            "src",
            srcPath
          )}) from (public/images)`,
          "error"
        );
      }
    };

    this.imageWatcher
      .on("add", (path) => copyToDest(path))
      .on("change", (path) => copyToDest(path))
      .on("unlink", (path) => removeFromDest(path))
      .on("addDir", (path) => mkdirInDest(path))
      .on("unlinkDir", (path) => removeDirFromDest(path))
      .on("error", (err) => {
        const error = err as Error;
        logger(`Failed to start /images watcher: (${error.message})`, "error");
        console.error(error);
      });
  }

  private async reloadPreview() {
    // reload salla preview WebSocket
    if (
      this.isConnected &&
      this.connection &&
      !this.isSyncing &&
      !this.isScriptBuilding
    ) {
      this.connection.send(JSON.stringify({ msg: "reload" }));
      logger("Preview reloaded", "success");
    } else {
      logger(`Preview reload ignored`, "warning");
    }
    console.log(
      "\n\x1b[37m-----------------------------------------------------------------\x1b[0m"
    );
  }

  private async syncFile(filePath: string) {
    if (
      !this.params.theme_id ||
      !this.params.store_id ||
      !this.params.draft_id ||
      !this.params.upload_url
    ) {
      logger("Missing required Salla configuration parameters", "error");
      return false;
    }

    const relPath = relativePath("src", filePath);
    logger(`Syncing file: (${relPath})`, "info");

    const command = `${this.params.sallaCli} theme sync -f "${filePath}" -id ${this.params.theme_id} -store_id ${this.params.store_id} -draft_id ${this.params.draft_id} -upload_url ${this.params.upload_url}`;
    const timer = new Timer();

    return new Promise((resolve) => {
      /*const child = */ exec(command, (error) => {
        if (error) {
          logger(`Failed to sync ${relPath}: ${error.message}`, "error");
          resolve(false);
        } else {
          logger(
            `Successfully synced: (${relPath}) in (${timer.duration})`,
            "success"
          );
          resolve(true);
        }
      });
      // Don't show any console logs at all 🐂💩
      // child.stdout?.pipe(process.stdout);
      // child.stderr?.pipe(process.stderr);
    });
  }

  private async queueSync(syncItem: SyncQueueItem) {
    if (!this.syncQueue.some((item) => item.file === syncItem.file)) {
      this.syncQueue.push(syncItem);
      // logger(`Queued sync for: (${relativePath("src", syncItem.file)})`, "warning");
    }
  }

  private async processSyncQueue() {
    if (this.isSyncing || this.syncQueue.length === 0) return;

    this.isSyncing = true;
    // logger(`Processing sync queue (${this.syncQueue.length}) file(s)`, "info");

    while (this.syncQueue.length > 0) {
      const queuedSync = this.syncQueue.shift()!;
      // Do the sync and then run the sync resolver to make synchronize() function returns
      await this.syncFile(queuedSync.file).then(() => {
        // set to false to allow reloading the preview after resolve
        this.isSyncing = false;
        queuedSync.resolver("");
      });
      // Small delay between syncs to avoid overwhelming salla 🤮🤮 server
      if (this.syncQueue.length > 0) {
        this.isSyncing = true;
        await waitFor(500);
      }
    }
    this.isSyncing = false;
  }

  /**
   * Used to handle the synchronization of (.twig) and (.json) files with salla servers
   * @param file the file path
   */
  private synchronize(file: string) {
    return new Promise((resolver) => {
      // Clear existing timer for this file
      if (this.syncDebounceTimers.has(file)) {
        clearTimeout(this.syncDebounceTimers.get(file));
      }
      // Set new timer for debouncing
      const timer = setTimeout(async () => {
        if (this.isConnected) {
          // If WebSocket is connected, queue the sync
          await this.queueSync({ file, resolver });
          await this.processSyncQueue();
        } else {
          resolver(""); // run the resolver
          logger(
            `Please, make sure that you are connected to sync the file`,
            "warning"
          );
        }
        this.syncDebounceTimers.delete(file);
      }, this.syncDebounce); // debouncing delay
      this.syncDebounceTimers.set(file, timer);
    });
  }

  /**
   * Used with script files updates to build an entry synchronously with
   * defering and queuing any entry if it's already in building state.
   * @info For development
   */
  async buildScriptEntrySync({
    rollupEntry,
    rollupEntryName,
    logDetails,
  }: SallaViteScriptPluginConfig) {
    const config: SallaViteScriptPluginConfig = {
      rollupEntry,
      rollupEntryName,
      logDetails: logDetails ?? true,
    };

    if (
      this.isScriptBuilding &&
      this.currentScriptBuildEntries.has(rollupEntryName)
    ) {
      logger(
        `Build script [${rollupEntryName}] already in progress, queuing...`,
        "warning"
      );
      return new Promise((resolver) => {
        this.deferedScriptBuildsMap.set(rollupEntryName, { config, resolver });
      });
    }

    this.isScriptBuilding = true;
    // Add to the current active builds
    this.currentScriptBuildEntries.add(rollupEntryName);

    try {
      return build({
        plugins: [sallaViteScriptPlugin(config)],
        configFile: false, // Ignore vite.config.ts file 💩
      });
    } catch (error) {
      const err = error as Error;
      logger(`Build [${rollupEntryName}] failed`, "error");
      console.error(err);
    } finally {
      this.isScriptBuilding = false;
      this.currentScriptBuildEntries.delete(rollupEntryName);

      // Process queued builds
      if (this.deferedScriptBuildsMap.size > 0) {
        const nextBuild = this.deferedScriptBuildsMap.get(rollupEntryName);
        if (nextBuild) {
          // Remove from defered
          this.deferedScriptBuildsMap.delete(rollupEntryName);
          this.buildScriptEntrySync(nextBuild.config).then(nextBuild.resolver);
          logger(
            `Build a defered [${nextBuild.config.rollupEntryName}] entry`,
            "warning"
          );
        }
      }
    }
  }

  /**
   * Used with initialBuild() function to build all salla entries asynchronously at the same time without
   * defering or queuing any entries if it's already in building state.
   * @info For development
   */
  async buildScriptEntryAsync({
    rollupEntry,
    rollupEntryName,
    logDetails,
  }: SallaViteScriptPluginConfig) {
    const config: SallaViteScriptPluginConfig = {
      rollupEntry,
      rollupEntryName,
      logDetails: logDetails ?? true,
    };

    try {
      return build({
        plugins: [sallaViteScriptPlugin(config)],
        configFile: false, // ignore vite.config.ts file
      });
    } catch (error) {
      const err = error as Error;
      logger(`Build [${rollupEntryName}] failed`, "error");
      console.error(err);
    }
  }

  /**
   * Used with style files updates to build an entry synchronously with
   * defering and queuing any entry if it's already in building state.
   * @info For development
   */
  async buildStyleEntrySync({
    rollupEntry,
    rollupEntryName,
    logDetails,
  }: SallaViteStylePluginConfig) {
    const config: SallaViteStylePluginConfig = {
      rollupEntry,
      rollupEntryName,
      logDetails: logDetails ?? true,
    };

    if (
      this.isStyleBuilding &&
      this.currentStyleBuildEntries.has(rollupEntryName)
    ) {
      logger(
        `Build script [${rollupEntryName}] already in progress, queuing...`,
        "warning"
      );
      return new Promise((resolver) => {
        this.deferedStyleBuildsMap.set(rollupEntryName, { config, resolver });
      });
    }

    this.isStyleBuilding = true;
    // Add to the current active builds
    this.currentStyleBuildEntries.add(rollupEntryName);

    try {
      return build({
        plugins: [sallaViteStylePlugin(config)],
        configFile: false, // Ignore vite.config.ts file 💩
      });
    } catch (error) {
      const err = error as Error;
      logger(`Build [${rollupEntryName}] failed`, "error");
      console.error(err);
    } finally {
      this.isStyleBuilding = false;
      this.currentStyleBuildEntries.delete(rollupEntryName);

      // Process queued builds
      if (this.deferedScriptBuildsMap.size > 0) {
        const nextBuild = this.deferedStyleBuildsMap.get(rollupEntryName);
        if (nextBuild) {
          // Remove from defered
          this.deferedStyleBuildsMap.delete(rollupEntryName);
          this.buildStyleEntrySync(nextBuild.config).then(nextBuild.resolver);
          logger(
            `Build a defered [${nextBuild.config.rollupEntryName}] entry`,
            "warning"
          );
        }
      }
    }
  }

  /**
   * This function will generate rollup entries dynamically from the /src/assets/styles folder
   * and store it locally in `this.viteStylesRollupEntries`.
   * @info For development
   */
  private async generateStylesRollupEntries() {
    this.viteStylesRollupEntries = generateRollupEntries(
      "src/assets/styles",
      "styles"
    );
  }

  /**
   * This function will construct the `/public/app.css` file without building it
   * it will just update the `@import` rulls to use the styles files in /public/styles folder.
   * @info For development
   */
  private async buildStylesAppFile() {
    try {
      const timer = new Timer();
      const data = (await fsPromises.readFile(SRC_STYLES_APP))
        .toString()
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "") // remove comments
        .replace(/\.(?:s(?:a|c)ss)/g, ".css") // convert imports to .css
        .replace(/(?<=\@import ["'])(?:\.\/)/g, "./styles/") // fix the import
        .trim();

      await fsPromises.writeFile(PUBLIC_STYLES_APP, data);

      logger(
        `Successfully build (app.css) file in -> (${timer.duration})`,
        "debug"
      );
    } catch (error) {
      const err = error as Error;
      logger(`Failed to build (app.css) file: ${err.message}`, "error");
      console.error(err);
    }
  }

  /**
   * This function will mirror and build `src/assets/styles` -> `public/styles`
   * for development builds, preserving structure and file names.
   * @info For development
   */
  private async mirrorAndBuildStyles() {
    try {
      const timer = new Timer();
      await build({
        configFile: false,
        plugins: [mirrorStylesPlugin({ entries: this.viteStylesRollupEntries })],
      });

      logger(
        `Successfully mirror & build styles in -> (${timer.duration})`,
        "debug"
      );
    } catch (error) {
      const err = error as Error;
      logger(`Failed to mirror & build styles: ${err.message}`, "error");
      console.error(err);
    }
  }

  /**
   * Initial build for the app styles.
   * @info For development
   */
  private async stylesInitialBuild() {
    await this.generateStylesRollupEntries();
    await excuteInParallel([
      this.mirrorAndBuildStyles(),
      this.buildStylesAppFile(),
    ]);
  }

  /**
   * Initial build for the app scripts.
   * @info For development
   */
  private async scriptsInitialBuild() {
    const scriptBuilds = Object.entries(this.viteScriptRollupEntries).map(
      ([entryName, entryPath]) => {
        const rollupEntry = { [entryName]: entryPath } as ViteScriptRollupEntry;
        const rollupEntryName = entryName as SallaScriptEntryName;
        return this.buildScriptEntryAsync({
          rollupEntry,
          rollupEntryName,
          logDetails: false,
        });
      }
    );

    await excuteInParallel(scriptBuilds);
  }

  /**
   * Initial build for the entire app.
   * @info For development
   */
  async initialBuild() {
    await clearFolder(PUBLIC); // Clear /public folder
    const timer = new Timer();

    logger(`Initial build started`, "info");

    await excuteInParallel([
      this.scriptsInitialBuild(),
      this.stylesInitialBuild(),
    ]);

    logger(`Initial build finished in => (${timer.duration})`, "info");
  }

  /**
   * Used with productionBuild() function to build all salla entries asynchronously at the same time without
   * defering or queuing any entries if it's already in building state.
   * @info For production
   */
  async productionEntryBuild({
    rollupEntry,
    rollupEntryName,
  }: SallaViteProductionPluginConfig) {
    try {
      return build({
        plugins: [
          sallaViteProductionPlugin({
            rollupEntry,
            rollupEntryName,
          }),
        ],
        configFile: false, // ignore vite.config.ts file
      });
    } catch (error) {
      const err = error as Error;
      logger(`Build [${rollupEntryName}] failed`, "error");
      console.error(err);
    }
  }

  /**
   * This function will build the app for production.
   * @info For production
   */
  async productionBuild() {
    await clearFolder(PUBLIC);

    const timer = new Timer();
    const builds = Object.entries(SALLA_VITE_ROLLUP_ENTRIES_PROD).map(
      ([entryName, entryPath]) => {
        const rollupEntry = { [entryName]: entryPath } as ViteRollupEntry;
        const rollupEntryName = entryName as SallaEntryName;

        return this.productionEntryBuild({
          rollupEntry,
          rollupEntryName,
        });
      }
    );

    logger("Production build started", "info");

    await excuteInParallel(builds);

    logger(`Production build finished in => (${timer.duration})\n`, "info");

    this.copyImages();
  }

  async run() {
    // Load Salla configuration from .salla.cli file
    if (!this.loadSallaConfig()) {
      logger(
        "Salla configuration (.salla.cli) is missing, some features may not work. Please restart the preview",
        "warning"
      );
      return;
    }
    // Setup WebSocket connection
    this.setupWebSocket(this.webSocketReconnetTrials);
    // Theme initial app build
    await this.initialBuild();
    // Start watching
    await this.setupFileWatcher();
    // Mirror and watch images
    await this.mirrorAndWatchImages();
    // Reload the preview
    await this.reloadPreview();
  }

  async stop() {
    this.watcher?.close();
    this.imageWatcher?.close();
    this.connection?.close(1000, "ws connection closed successfully");

    logger("Salla preview terminated successfully", "info");
    logger("Good bye dev 👋", "success");
  }
}
