import { type FSWatcher, watch } from "chokidar";
import { build } from "vite";
import chokidar from "chokidar";
import path from "path";
import fs, { promises as fsPromises } from "fs";
import { WebSocket } from "ws";
import { exec } from "child_process";
import { sallaViteScriptPlugin } from "./salla-vite-script-dev-plugin.ts";
import {
  relativePath,
  clearFolder,
  copyDir,
  Timer,
  isFileInsideFolder,
} from "./utils/tools.ts";
import {
  _assets,
  _public,
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
  generateStyleRollupEntry,
  generateStylesRollupEntries,
  getScriptFileRebuildEntries,
} from "./utils/build-tools.ts";
import { sallaViteProductionPlugin } from "./salla-vite-prod-plugin.ts";
import {
  mirrorStylesPlugin,
  sallaViteStylePlugin,
} from "./salla-vite-style-dev-plugin.ts";
import { Logger } from "./utils/logger.ts";
import { HMRClient } from "./utils/hmr-client..ts";

export class SallaViteBuilder {
  //=================================================================================
  //========================== VARIABLES & PROPERTIES START =========================
  //=================================================================================

  /**
   * This porperty hold the WebSocket reconnect trials if the connnection failed
   */
  private readonly webSocketReconnetTrials = 2; // times
  /**
   * This porperty will hold the time to wait before try to reconnect the WebSocket again
   */
  private readonly webSocketReconnetInterval = 5000; // ms
  /**
   * This property will hold the debouncing delay for (.twig | .json) files sync with salla server
   */
  private readonly syncDebounce = 700; // ms
  /**
   * This property will hold a regex used to extract the current imported styles files in the `/src/assets/styles/app.scss` file
   * used with {@link extractImportedEntriesFromAppFileContent} function
   */
  private readonly extractCurrentStyleImportsRegex =
    /(?<=\@import\s*["']\.\/)(.+)(?=\.s?(?:a|c)ss["']\;?)/g;
  /**
   * This property will hold a boolean value used to check if any script entry is in building state right now or not
   */
  private isScriptBuilding = false;
  /**
   * This property will hold a boolean value used to check if any style entry is in building state right now or not
   */
  private isStyleBuilding = false;
  /**
   * This property will hold the current active building scripts entries
   * used to prevent build the same entry at the same time
   */
  private currentScriptBuildEntries: Set<SallaScriptEntryName> = new Set();
  /**
   * This property will hold the current active building styles entries
   * used to prevent build the same entry at the same time
   */
  private currentStyleBuildEntries: Set<SallaStyleEntryName> = new Set();
  /**
   * This property will hold the current imported entries in the `/src/assets/styles/app.scss` file
   */
  private currentImportedStyleEntries: Set<SallaStyleEntryName> = new Set();
  /**
   * This property will hold the defered script builds
   * if the same entry is currently in building state
   */
  private deferedScriptBuildsMap: Map<
    SallaScriptEntryName,
    DeferedScriptBuild
  > = new Map();
  /**
   * This property will hold the defered style builds
   * if the same entry is currently in building state
   */
  private deferedStyleBuildsMap: Map<SallaStyleEntryName, DeferedStyleBuild> =
    new Map();

  /** The file watcher object */
  private watcher: FSWatcher | null = null;
  /** The images watcher object */
  private imageWatcher: FSWatcher | null = null;
  /** The HMR client - used to perform CSS hot reloads */
  private hmrClient: HMRClient | null = null;
  /** The WebSocket connection with Salla CLI live reload URL */
  private sallaConnection: WebSocket | null = null;
  /** Used to check if you are connected with Salla CLI live reload URL */
  private isConnected = false;
  /** Used to check if the watcher is currently syncing a (.twig | .json) files */
  private isSyncing = false;
  /** This holds the setTimeout timers that used to debouncing Salla syncing process */
  private syncDebounceTimers = new Map<string, NodeJS.Timeout>();
  /** This holds the setTimeout timers that used to debouncing the "change" event on file watcher */
  private watchDebounceTimers = new Map<string, NodeJS.Timeout>();
  /** This holds the main infomation about the CLI and the theme */
  private params: SallaCliParams = {
    theme_id: undefined,
    draft_id: undefined,
    store_id: undefined,
    upload_url: undefined,
    wsport: undefined,
    sallaCli: "salla",
    lastRequestTime: undefined,
  };
  /** This hold Vite style rollup build entries */
  private viteStylesRollupEntries: Record<string, string> = {};
  /** This hold Vite script rollup build entries */
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

  //=================================================================================
  //========================== VARIABLES & PROPERTIES END ===========================
  //=================================================================================

  //=================================================================================
  //============================ Tools & FUNCTIONS START ============================
  //=================================================================================

  /**
   * This function used to copy the images from the `/src/assets/images` to `/public/images`
   * at initial or production build
   */
  async copyImages() {
    await copyDir(SRC_IMGS, PUBLIC_IMGS);
  }

  /**
   * This function used to load Salla CLI configuration from `/node_modules/.salla.cli` file
   */
  private loadSallaConfig = () => {
    const cachePath = path.join(process.cwd(), "/node_modules/.salla-cli");
    if (fs.existsSync(cachePath)) {
      try {
        this.params = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        Logger.info(
          `Loaded Salla config: Theme ID ${this.params.theme_id}, Store ID ${this.params.store_id}, Draft ID ${this.params.draft_id}`
        );
        return true;
      } catch (err) {
        Logger.error(`Failed to parse Salla CLI config file`);
        console.error(err);
        return false;
      }
    } else {
      Logger.warning(
        "Salla CLI config not found. Make sure to run 'salla theme preview' first."
      );
      return false;
    }
  };

  /**
   * WebSocket and HMR connections management
   * @param reconnectTrials number of reconnect trials
   */
  private setupSallaCLIWebSocket(reconnectTrials: number) {
    if (!this.params?.wsport || reconnectTrials <= 0) {
      Logger.warning(
        "WebSocket port not configured restart the preview to try again"
      );
      return;
    }

    try {
      this.hmrClient = new HMRClient({
        assetsPort: this.params.wsport! - 1,
        hmrPort: this.params.wsport!,
      });

      this.sallaConnection = new WebSocket(
        `ws://localhost:${this.params.wsport}`,
        "echo-protocol"
      );

      this.sallaConnection.on("open", () => {
        this.isConnected = true;
        Logger.success(
          `Connected to Salla CLI WebSocket on port ws://localhost:${this.params.wsport}`
        );
      });

      this.sallaConnection.on("error", () => {
        Logger.error(`Salla CLI WebSocket connection failed`);
        this.isConnected = false;
        // Retry connection after 5 seconds
        setTimeout(
          () => this.setupSallaCLIWebSocket(reconnectTrials - 1),
          this.webSocketReconnetInterval
        );
      });

      this.sallaConnection.on("close", () => {
        this.isConnected = false;
        this.sallaConnection = null;
        Logger.info("Salla CLI WebSocket connection closed");
      });
    } catch (err) {
      Logger.error(`Failed to connect to Salla CLI WebSocket`);
      console.error(err);
    }
  }

  /**
   * This function will setup the file watcher to watch
   * (change | add | unlink) of ay file in the `/src` dir
   */
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
      if (this.watchDebounceTimers.has(file)) {
        clearTimeout(this.watchDebounceTimers.get(file));
      }
      const timeout = setTimeout(async () => {
        // Remove the timer
        this.watchDebounceTimers.delete(file);
        const relPath = relativePath("src", file);
        Logger.line();
        Logger.info(`File changed: (${relPath})`, true);

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
            if (this.isSrcStylesAppFile(file)) {
              await this.buildStylesAppFile();
              await this.hmrClient!.cssHMR();
            } else {
              const rollupEntryName =
                this.extractStlyeRollupEntryNameFromPath(file);
              const rollupEntry =
                this.getStyleRollupEntryByName(rollupEntryName);

              if (rollupEntry) {
                await this.buildStyleEntrySync({
                  rollupEntry,
                  rollupEntryName,
                });

                // Only rebuild the app.scss file and hmr it if the entry is imported
                if (this.isStyleEntryImported(rollupEntryName)) {
                  await this.buildStylesAppFile();
                  await this.hmrClient!.cssHMR();
                } else {
                  Logger.debug(
                    `HMR update ignored for Entry [${rollupEntryName}] - because it's not imported`
                  );
                }
              } else {
                Logger.debug(
                  `Build ignored because entry [${rollupEntryName}] doesn't exsist in the style entries`
                );
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
              Logger.debug(
                `Rebuild ignored for this file [${dependencyPath}] - because it's not used by any entry`
              );
            }
            break;
          }
        }
      }, 50); // small delay to ignore rapid changes in the same file
      this.watchDebounceTimers.set(file, timeout);
    };

    const handleAdd = async (file: string) => {
      const relPath = relativePath("src", file);
      Logger.line();
      Logger.info(`File added: (${relPath})`, true);

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
          if (this.isSrcStylesAppFile(file)) {
            Logger.debug(
              `Please, don't remove "~/src/assets/styles/app.scss" file it's forbidden`
            );
            return;
          }

          if (this.isFileiInsideSrcStylesFolder(file)) {
            // Generate and add the new file to the style entries
            const { rollupEntry, rollupEntryName } =
              this.generateAndAddNewStyleEntry(file);

            await this.buildStyleEntrySync({
              rollupEntry,
              rollupEntryName,
            });

            // Only rebuild the app.scss file and hmr it if the entry is imported
            if (this.isStyleEntryImported(rollupEntryName)) {
              await this.buildStylesAppFile();
              await this.hmrClient!.cssHMR();
            } else {
              Logger.debug(
                `HMR update ignored for Entry [${rollupEntryName}] - because it's not imported`
              );
            }

            Logger.success(
              `New entry [${rollupEntryName}] added to styles entries`
            );
          } else {
            Logger.debug(
              `File [${relPath}] isn't inside /src/styles folder - please put all your style inside it`
            );
          }
          break;
        }
        case "script": {
          break;
        }
      }
    };

    const handleUnlink = async (file: string) => {
      const relPath = relativePath("src", file);
      Logger.line();
      Logger.info(`File unlinked: (${relPath})`, true);
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
          if (this.isSrcStylesAppFile(file)) {
            Logger.debug(
              `Please, don't remove "~/src/assets/styles/app.scss" file it's fobidden`
            );
            return;
          }

          if (!this.isFileiInsideSrcStylesFolder(file)) {
            return;
          }

          const { rollupEntryName } =
            await this.deleteStyleFromPublicAndEntries(file);

          // Only rebuild the app.scss file and hmr it if the entry is imported
          if (this.isStyleEntryImported(rollupEntryName)) {
            await this.buildStylesAppFile();
            await this.hmrClient!.cssHMR();
          } else {
            Logger.debug(
              `HMR update ignored for Entry [${rollupEntryName}] - because it's not imported`
            );
          }
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
        Logger.error(`Failed to start /src watcher: (${err.message})`);
        console.error(err);
      });
  }

  private async closeFileWatcher() {
    try {
      await this.watcher!.close();
      Logger.info("File watcher 📁 closed successfully");
    } catch (err) {
      Logger.error("Failed to close the file watcher 📁");
      console.error(err);
    }
  }

  /**
   * This function will setup the images watcher to watch
   * (change | add | unlink) of ay file in the `/src/assets/images` dir
   */
  private async setupImageWatcher() {
    // Copy images first
    await this.copyImages();

    const srcDir = SRC_IMGS;
    const destDir = PUBLIC_IMGS;

    this.imageWatcher = chokidar.watch(srcDir, {
      ignoreInitial: true,
      persistent: true,
    });

    const copyToPublic = async (srcPath: string) => {
      Logger.line();
      const srcRelPath = relativePath("src", srcPath);
      const relPath = path.relative(srcDir, srcPath);
      const destPath = path.join(destDir, relPath);

      try {
        const timer = new Timer();
        await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
        await fsPromises.copyFile(srcPath, destPath);
        Logger.success(
          `Copy (${srcRelPath}) to (public/images) in -> (${timer.duration})`,
          true
        );
      } catch (err) {
        Logger.error(`Failed to copy (${srcRelPath}) to (public/images)`);
        console.error(err);
      }
    };

    const removeFromPublic = async (srcPath: string) => {
      Logger.line();
      const srcRelPath = relativePath("src", srcPath);
      const relPath = path.relative(srcDir, srcPath);
      const destPath = path.join(destDir, relPath);

      try {
        const timer = new Timer();
        await fsPromises.unlink(destPath);
        Logger.success(
          `Unlink (${srcRelPath}) from (public/images) in -> (${timer.duration})`,
          true
        );
      } catch (err) {
        // File might not exist, ignore
        Logger.error(`Failed to unlink (${srcRelPath}) from (public/images)`);
        console.error(err);
      }
    };

    const mkdirInPublic = async (srcPath: string) => {
      Logger.line();
      const srcRelPath = relativePath("src", srcPath);
      const relPath = path.relative(srcDir, srcPath);
      const destPath = path.join(destDir, relPath);

      try {
        const timer = new Timer();
        await fsPromises.mkdir(destPath, { recursive: true });
        Logger.success(
          `Copy dir (${srcRelPath}) to (public/images) in -> (${timer.duration})`,
          true
        );
      } catch (err) {
        Logger.error(`Failed to copy dir (${srcRelPath}) to (public/images)`);
        console.error(err);
      }
    };

    const removeDirFromPublic = async (srcPath: string) => {
      Logger.line();
      const srcRelPath = relativePath("src", srcPath);
      const relPath = path.relative(srcDir, srcPath);
      const destPath = path.join(destDir, relPath);

      try {
        const timer = new Timer();
        await fsPromises.rm(destPath, { recursive: true, force: true });
        Logger.success(
          `Unlink dir (${srcRelPath}) from (public/images) in {${timer.duration}}`,
          true
        );
      } catch (err) {
        // Directory might not exist, ignore
        Logger.error(
          `Failed to unlink dir (${srcRelPath}) from (public/images)`
        );
        console.error(err);
      }
    };

    this.imageWatcher
      .on("add", (path) => copyToPublic(path))
      .on("change", (path) => copyToPublic(path))
      .on("unlink", (path) => removeFromPublic(path))
      .on("addDir", (path) => mkdirInPublic(path))
      .on("unlinkDir", (path) => removeDirFromPublic(path))
      .on("error", (error) => {
        const err = error as Error;
        Logger.error(`Failed to start /images watcher: (${err.message})`);
        console.error(err);
      });
  }

  private async closeImageWatcher() {
    try {
      await this.imageWatcher!.close();
      Logger.info("Image watcher 📷 closed successfully");
    } catch (err) {
      Logger.error("Failed to close the image watcher 📷");
      console.error(err);
    }
  }

  /**
   * This function will reload the preview at Salla CLI live reload URL
   */
  private async reloadPreview() {
    // reload salla preview WebSocket
    if (
      this.isConnected &&
      this.sallaConnection &&
      !this.isSyncing &&
      !this.isScriptBuilding &&
      !this.isStyleBuilding
    ) {
      // this.sallaConnection.send(JSON.stringify({ msg: "reload" }));
      await this.hmrClient!.reload();
      Logger.info("Preview reloaded");
    } else {
      Logger.debug(`Preview reload ignored`);
    }
  }

  /**
   * This function will sync a (.twig | .json) file with salla server to confirm changes
   * @param filePath the absolute file path
   * @returns
   */
  private syncFile(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (
        !this.params.theme_id ||
        !this.params.store_id ||
        !this.params.draft_id ||
        !this.params.upload_url
      ) {
        Logger.error("Missing required Salla configuration parameters");
        resolve(false);
        return;
      }
      this.isSyncing = true;

      const relPath = relativePath("src", filePath);
      Logger.info(`Syncing file: (${relPath})`);

      const command = `${this.params.sallaCli} theme sync -f "${filePath}" -id ${this.params.theme_id} -store_id ${this.params.store_id} -draft_id ${this.params.draft_id} -upload_url ${this.params.upload_url}`;
      const timer = new Timer();

      /*const child = */

      exec(command, (error) => {
        if (error) {
          Logger.error(`Failed to sync ${relPath}: ${error.message}`);
          console.error(error);
          resolve(false);
        } else {
          Logger.success(
            `Successfully synced: (${relPath}) in -> (${timer.duration})`
          );
          resolve(true);
        }
        this.isSyncing = false;
      });

      // Don't show any console logs at all about sync proccess from salla CLI 🐂💩
      // child.stdout?.pipe(process.stdout);
      // child.stderr?.pipe(process.stderr);
    });
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
        // Sync only if WebSocket is connected
        if (this.isConnected) {
          await this.syncFile(file).then(resolver);
        } else {
          resolver(""); // run the resolver
          Logger.warning(
            `Please, make sure that you are connected to sync the file`
          );
        }
        // Remove the timer
        this.syncDebounceTimers.delete(file);
      }, this.syncDebounce); // debouncing delay
      this.syncDebounceTimers.set(file, timer);
    });
  }

  /**
   * Thsi function will check if the file is the `/src/assets/styles/app.scss` file or not
   * @param file the file path to check
   * @returns
   */
  private isSrcStylesAppFile(file: string) {
    const srcStylesAppFile = path.resolve("src/assets/styles/app.scss");
    return file === srcStylesAppFile;
  }

  /**
   * This function will check if the file is inside `/src/assets/styles` folder or not
   * @param file the file path
   * @returns
   */
  private isFileiInsideSrcStylesFolder(file: string) {
    return isFileInsideFolder(file.replaceAll("\\", "/"), SRC_STYLES);
  }

  /**
   * This function will check if the style entry is imported in `/src/assets/styles/app.scss` file or not
   * @param styleEntryName the style entry name
   * @returns
   */
  private isStyleEntryImported(styleEntryName: SallaStyleEntryName) {
    return this.currentImportedStyleEntries.has(styleEntryName);
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
    if (!entryPath) return null;
    return { [rollupStyleEntryName]: entryPath } as ViteStyleRollupEntry;
  }

  /**
   * This function will generate the style entry from the file path
   * and then add the new entry to {@link viteStylesRollupEntries}
   * @param file the file path
   * @returns
   */
  private generateAndAddNewStyleEntry(file: string): {
    rollupEntry: ViteStyleRollupEntry;
    rollupEntryName: SallaStyleEntryName;
  } {
    // Generate the style entry
    const rollupEntry = generateStyleRollupEntry(file);
    // Add the new style entry
    Object.assign(this.viteStylesRollupEntries, rollupEntry);

    return {
      rollupEntry,
      rollupEntryName: Object.keys(rollupEntry)[0]!,
    };
  }

  /**
   * This function will generate rollup entries dynamically from the /src/assets/styles folder
   * and store it locally in `this.viteStylesRollupEntries`.
   * @info For development
   */
  private async initiateStylesRollupEntries() {
    this.viteStylesRollupEntries =
      generateStylesRollupEntries("src/assets/styles");
  }

  /**
   * This function will read the content of the `/src/assets/style/app.scss` file
   */
  private async readStylesAppFile() {
    return (await fsPromises.readFile(SRC_STYLES_APP))
      .toString()
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // remove comments;
  }

  /**
   * This function will:
   * - delete the file from `/public/styles` folder
   * - remove the file entry from {@link viteStylesRollupEntries}
   * @param file the target file
   */
  private async deleteStyleFromPublicAndEntries(file: string): Promise<{
    rollupEntryName: string;
  }> {
    const rollupEntryName = this.extractStlyeRollupEntryNameFromPath(file);
    // Convert the extension to (.css) instead of (.scss or .sass)
    const srcStylesRelative =
      path.relative(SRC_STYLES, file).split(".")[0]! + ".css";
    const filePublicPath = path.resolve("public/styles", srcStylesRelative);

    // [1] Remove file from public
    if (fs.existsSync(filePublicPath)) {
      fs.rmSync(filePublicPath, { force: true, recursive: true });
    }
    // [2] Remove from style entries
    delete this.viteStylesRollupEntries[rollupEntryName];

    return {
      rollupEntryName,
    };
  }

  /**
   * This function will extract the vite rollup entry key from the file path
   * @param filePath the file path
   * @example `~/src/assets/styles/01-settings/global.scss` -> `styles/01-settings/global`
   */
  private extractStlyeRollupEntryNameFromPath(filePath: string) {
    return `styles/${path
      .relative(SRC_STYLES, filePath)
      .replaceAll("\\", "/")}`.split(".")[0]!;
  }

  /**
   * This function will get and save of the actual imported entries
   * in the main `src/assets/styles/app.scss` file
   */
  private async getAndSaveCurrentImportedStyleEntries(): Promise<string[]> {
    const fileContent = await this.readStylesAppFile();

    // Extract the current imported entries array from the `/src/assets/styles/app.scss` file
    const currentImportsArray =
      fileContent
        .match(this.extractCurrentStyleImportsRegex)
        ?.map((entry) => `styles/${entry}`) || [];

    // Clear the current entries
    this.currentImportedStyleEntries.clear();
    // Add the new entries
    currentImportsArray.forEach((entry) => {
      this.currentImportedStyleEntries.add(entry);
    });

    return currentImportsArray;
  }

  //=================================================================================
  //============================= Tools & FUNCTIONS END =============================
  //=================================================================================

  //=================================================================================
  //============================ BUILD FUNCTIONS START ==============================
  //=================================================================================

  /**
   * Used with script files updates to build an entry synchronously with
   * defering and queuing any entry if it's already in building state.
   * @info For development
   */
  private async buildScriptEntrySync({
    rollupEntry,
    rollupEntryName,
    logDetails,
  }: SallaViteScriptPluginConfig) {
    const config: SallaViteScriptPluginConfig = {
      rollupEntry,
      rollupEntryName,
      logDetails: logDetails ?? true,
    };

    if (this.currentScriptBuildEntries.has(rollupEntryName)) {
      Logger.debug(
        `Build script [${rollupEntryName}] already in progress, queuing...`
      );
      return new Promise((resolver) => {
        this.deferedScriptBuildsMap.set(rollupEntryName, { config, resolver });
      });
    }

    this.isScriptBuilding = true;
    // Add to the current active builds
    this.currentScriptBuildEntries.add(rollupEntryName);

    try {
      await build({
        plugins: [sallaViteScriptPlugin(config)],
        mode: "development",
        configFile: false, // Ignore vite.config.ts file 💩
      });
    } catch (error) {
      const err = error as Error;
      Logger.error(
        `Build [${rollupEntryName}] failed: [${err.name}] -> ${err.message}`
      );
    } finally {
      this.isScriptBuilding = false;
      this.currentScriptBuildEntries.delete(rollupEntryName);

      // Process queued builds
      if (this.deferedScriptBuildsMap.size > 0) {
        const nextBuild = this.deferedScriptBuildsMap.get(rollupEntryName);
        if (nextBuild) {
          // Remove from defered
          this.deferedScriptBuildsMap.delete(rollupEntryName);
          Logger.debug(
            `Build a defered [${nextBuild.config.rollupEntryName}] script entry`
          );
          this.buildScriptEntrySync(nextBuild.config).then(nextBuild.resolver);
        }
      }
    }
  }

  /**
   * Used with style files updates to build an entry synchronously with
   * defering and queuing any entry if it's already in building state.
   * @info For development
   */
  private async buildStyleEntrySync({
    rollupEntry,
    rollupEntryName,
    logDetails,
  }: SallaViteStylePluginConfig) {
    const config: SallaViteStylePluginConfig = {
      rollupEntry,
      rollupEntryName,
      logDetails: logDetails ?? true,
    };

    if (this.currentStyleBuildEntries.has(rollupEntryName)) {
      Logger.debug(
        `Build style [${rollupEntryName}] already in progress, queuing...`
      );
      return new Promise((resolver) => {
        this.deferedStyleBuildsMap.set(rollupEntryName, { config, resolver });
      });
    }

    this.isStyleBuilding = true;
    // Add to the current active builds
    this.currentStyleBuildEntries.add(rollupEntryName);

    try {
      await build({
        plugins: [sallaViteStylePlugin(config)],
        mode: "development",
        configFile: false, // Ignore vite.config.ts file 💩
      });
    } catch (error) {
      const err = error as Error;
      Logger.error(
        `Build [${rollupEntryName}] failed: [${err.name}] -> ${err.message}`
      );
    } finally {
      this.isStyleBuilding = false;
      this.currentStyleBuildEntries.delete(rollupEntryName);

      // Process queued builds
      if (this.deferedStyleBuildsMap.size > 0) {
        const nextBuild = this.deferedStyleBuildsMap.get(rollupEntryName);
        if (nextBuild) {
          // Remove from defered
          this.deferedStyleBuildsMap.delete(rollupEntryName);
          Logger.debug(
            `Build a defered [${nextBuild.config.rollupEntryName}] style entry`
          );
          this.buildStyleEntrySync(nextBuild.config).then(nextBuild.resolver);
        }
      }
    }
  }

  /**
   * Used with initialBuild() function to build all salla entries asynchronously at the same time without
   * defering or queuing any entries if it's already in building state.
   * @info For development
   */
  private async buildScriptEntryAsync({
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
        mode: "development",
        configFile: false, // ignore vite.config.ts file
      });
    } catch (error) {
      const err = error as Error;
      Logger.error(
        `Build [${rollupEntryName}] failed: [${err.name}] -> ${err.message}`
      );
    }
  }

  /**
   * This function will construct the `/public/app.css` file without building it
   * it will just update the `@import` rules to use the styles files in /public/styles folder.
   * @info For development
   */
  private async buildStylesAppFile() {
    try {
      const timer = new Timer();

      // Read the current imported styles in the app.scss file
      const currentImportsArray =
        await this.getAndSaveCurrentImportedStyleEntries();

      // Write the new content of the `/public/app.css` file
      if (currentImportsArray.length > 0) {
        const finalContent = currentImportsArray
          .filter((entry) => this.viteStylesRollupEntries[entry]) // Keep only the entries that exists in the src/styles/** dir
          .map((entry) => `@import "./${entry}.css";`) // Convert to @import rule
          .join("\n"); // join all line by line

        await fsPromises.writeFile(PUBLIC_STYLES_APP, finalContent);

        Logger.debug(
          `(app.css) file built successfully in -> (${timer.duration})`
        );
      } else {
        await fsPromises.writeFile(PUBLIC_STYLES_APP, "");
        Logger.debug(`(app.scss) file is empty`);
      }
    } catch (error) {
      const err = error as Error;
      Logger.error(
        `Failed to build (app.css) file: [${err.name}] -> ${err.message}`
      );
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
        plugins: [
          mirrorStylesPlugin({ entries: this.viteStylesRollupEntries }),
        ],
      });

      Logger.debug(
        `Successfully mirror & build styles in -> (${timer.duration})`
      );
    } catch (error) {
      const err = error as Error;
      Logger.error(
        `Failed to mirror & build styles: [${err.name}] -> ${err.message}`
      );
    }
  }

  /**
   * Initial build for the app styles.
   * @info For development
   */
  private async stylesInitialBuild() {
    await this.initiateStylesRollupEntries();
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

    Logger.info(`Initial build started`);

    await excuteInParallel([
      this.scriptsInitialBuild(),
      this.stylesInitialBuild(),
    ]);

    Logger.info(`Initial build finished in => (${timer.duration})`);
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
        plugins: [sallaViteProductionPlugin({ rollupEntry, rollupEntryName })],
        mode: "production",
        configFile: false, // ignore vite.config.ts file
      });
    } catch (error) {
      const err = error as Error;
      Logger.error(
        `Build [${rollupEntryName}] failed: [${err.name}] -> ${err.message}`
      );
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

    Logger.success("Production build started");

    await excuteInParallel(builds);

    Logger.success(`Production build finished in => (${timer.duration})\n`);

    this.copyImages();
  }

  //=================================================================================
  //============================= BUILD FUNCTIONS END ===============================
  //=================================================================================

  /**
   * Run the watcher for development
   */
  async run() {
    // Load Salla configuration from .salla.cli file
    if (!this.loadSallaConfig()) {
      Logger.warning(
        "Salla configuration (.salla.cli) is missing, some features may not work. Please restart the preview"
      );
      return;
    }
    // Setup WebSocket connection
    this.setupSallaCLIWebSocket(this.webSocketReconnetTrials);
    // Theme initial app build
    await this.initialBuild();
    // Start watching
    await this.setupFileWatcher();
    // Mirror and watch images
    await this.setupImageWatcher();
    // Reload the preview
    await this.reloadPreview();
  }

  /**
   * Terminate the watcher and cleanup
   */
  async stop() {
    console.clear();
    await excuteInParallel([
      this.closeFileWatcher(),
      this.closeImageWatcher(),
      this.hmrClient!.close(),
    ]);
    this.sallaConnection?.close();

    Logger.info("Salla vite watcher terminated successfully");
    Logger.info("Good bye dev 👋\n");
  }
}
