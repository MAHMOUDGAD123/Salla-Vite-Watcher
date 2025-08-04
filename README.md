![Logo](./Salla-Vite.png)

# Salla Vite Watcher⚡

A high-performance, modern Vite watcher that supercharges Salla theme development by replacing the legacy Webpack workflow. Enjoy instant hot reloads, robust .twig syncing, and a seamless developer experience tailored for Salla CLI and Twilight themes.

---

## 🚀 Why Use This Plugin?

- **Improvement in .twig/.json files updates**: Enhanced file watching and syncing with better performance and reliability for template changes.
- **TypeScript support**: Full TypeScript integration with type checking and modern development experience.
- **HMR for styles updates**: Hot Module Replacement for CSS/SCSS files with instant style updates without page refresh.
- **Smart updates for scripts and styles**: Intelligent detection and rebuilding of only changed files, optimizing build times and resource usage.
- **Incremental style builds**: Only rebuilds the updated style file instead of rebuilding the whole `app.scss` → `app.css`.
- **Dependency-aware script builds**: Only rebuilds the updated script if it's updated or any of its dependencies change.

---

## 🧠 How It Works (Deep Dive)

1. **File Watching**

   - Monitors all `src/**/*.twig` and `src/**/*.json` files for changes using a high-performance watcher.
   - Debounces rapid changes (500ms) to avoid redundant syncs.
   - Watches image files in `src/assets/images/` for automatic copying to `public/images/`.
   - **Tailwind optimization**: Rebuilds the Tailwind style file only on `.twig` files updates for faster performance.

2. **Sync Queue**

   - Changed files are queued for syncing to prevent race conditions and server overload.
   - Each file is synced via `salla theme sync -f <file>` with the correct theme, store, and draft IDs.
   - Syncs are processed one at a time, with a short delay between each.

3. **WebSocket Reload**

   - After all syncs complete, a reload signal is sent to the Salla preview browser via WebSocket.
   - The preview UI fetches the latest draft, ensuring you always see the most up-to-date templates.
   - Automatic reconnection and error handling ensure reliability even if the preview server restarts.

4. **Asset & Build Management**

   - JS/SCSS entrypoints are auto-configured for Vite with intelligent detection.
   - Images in `src/assets/images` are copied to `public/images` only if changed.
   - Supports multiple script and style entry points with automatic rollup configuration.
   - **Incremental style processing**: Only rebuilds individual style files instead of the entire `app.scss` bundle.
   - **Smart script dependency tracking**: Rebuilds scripts only when the file itself or its dependencies change.

5. **Logging & Debugging**
   - Colorful, timestamped logs for all major actions.
   - Enable verbose debug output with `NODE_ENV=debug`.

---

## ✨ Features

- **Automatic .twig/.json sync** on save
- **Debounced file watching** for efficient updates
- **Sync queue** to prevent race conditions
- **WebSocket reload** for instant preview updates
- **Automatic image copying** from `src/assets/images/` to `public/images/`
- **SCSS import enforcement** and compilation
- **Multiple entry point support** for scripts and styles
- **Enhanced logging** (info, success, warning, error, debug)
- **Automatic Salla CLI config detection**
- **Graceful error handling and recovery**
- **Production build optimization**

---

## 🛠️ Quick Start

### Prerequisites

- [Salla CLI](https://www.npmjs.com/package/@salla.sa/cli) installed and authenticated
- Your theme project set up with Twilight and this plugin (default in modern Salla themes)
- Node.js 18+ and pnpm package manager

### Development Workflow

**Open 2 terminals for the complete development experience:**

**Terminal 1 - Salla Preview:**

```bash
salla theme preview
```

**Terminal 2 - Vite Watcher:**

```bash
pnpm dev
```

**Available Commands:**

```bash
# Development modes
pnpm dev              # Standard development
pnpm dev:debug        # Development with debug logging
pnpm dev:watch        # Development with file watching
pnpm dev:watch:debug  # Development with file watching and debug

# Production
pnpm prod             # Production build with optimization
```

---

## ⬆️ Migration Guide: Preparing Your Salla Theme for Vite

Follow these steps to migrate your Salla theme to use Vite as a development tool:

### Step 1: Project Structure & Dependencies

1. **Add the following to your project:**

   **📁 Folder Structure:**

   - Add `/plugins` folder to the project root
   - Add `/src/assets/js/_helpers` and `/src/assets/js/_output` folders to your `/src/assets/js` folder

   **🔥 HMR Setup:**

   - Import the `_helpers/hmr-activation.ts` file at the top of your `/src/assets/js/app.js` file to activate the HMR magic on styles updates:

     ```javascript
     // .....
     // import AppHelpers from "./app-helpers";

     // Just import it here
     import "./_helpers/hmr-activation";

     // class App extends AppHelpers {}
     ```

   **🎨 Style Requirements:**

   - Make sure that `/src/assets/styles/app.scss` file only contains absolute imports for local files in the `/src/assets/styles` folder like this:

     ```scss
     // Like this for example

     @import "./01-settings/tailwind.scss";
     @import "./01-settings/fonts.scss";
     @import "./01-settings/global.scss";
     @import "./01-settings/breakpoints.scss";

     @import "./02-generic/reset.scss";
     @import "./02-generic/common.scss";

     @import "./03-elements/form.scss";
     @import "./03-elements/buttons.scss";
     @import "./03-elements/radio.scss";
     @import "./03-elements/radio-images.scss";

     @import "./04-components/header.scss";
     @import "./04-components/footer.scss";
     @import "./04-components/menus.scss";

     @import "./05-utilities/chat-bots.scss";
     @import "./05-utilities/swal.scss";

     @import "./06-packages/tools.scss";
     ```

   - Make sure that all styles are in `/src/assets/styles/**` folder because it will be ignored if it is in another folder

   **⚙️ Configuration Files:**

   - Add the rest files to your project root or replace them:
     - `package.json`
     - `postcss.config.ts`
     - `tailwind.config.ts`
     - `tsconfig.json`
     - `vite.config.ts`

2. **Update your `package.json`:**
   - Update the `devDependencies` section with all required packages
   - Add all needed packages as dev dependencies then install them:
     ```sh
     pnpm i
     ```
   - Update scripts for Vite:
     ```json
     "scripts": {
       "watch": "cross-env NODE_NO_WARNINGS=1 ts-node ./plugins/fake-watcher.ts",
       "prod": "cross-env NODE_NO_WARNINGS=1 ts-node ./plugins/vite.prod.ts",
       "dev": "cross-env NODE_NO_WARNINGS=1 ts-node ./plugins/vite.dev.ts",
       "dev:debug": "cross-env NODE_NO_WARNINGS=1 NODE_ENV=debug ts-node ./plugins/vite.dev.ts",
       "dev:watch": "cross-env NODE_NO_WARNINGS=1 tsx watch ./plugins/vite.dev.ts",
       "dev:watch:debug": "cross-env NODE_NO_WARNINGS=1 NODE_ENV=debug tsx watch ./plugins/vite.dev.ts"
     }
     ```

### Step 2: Update Script Tags for ESM

- In all relevant `.twig` template files in `/src`, update every local `<script>` tag that loads a JS file to use ESM by adding `type="module"`:
  ```html
  <script src="..." type="module"></script>
  ```

### Step 3: Start Development

- Use the custom Vite plugin in `/plugins/vite-builder.ts` for Salla-specific sync and reload logic.
- **You need to open 2 terminals for the development workflow:**

  **Terminal 1 - Salla Preview:**

  ```sh
  salla theme preview
  ```

  or to ignore some configuration with:

  ```sh
  salla theme p --with-editor --store=<your_store_name>
  ```

  **Terminal 2 - Vite Watcher:**

  ```sh
  pnpm dev
  ```

  or for debug mode:

  ```sh
  pnpm dev:debug
  ```

  or for file watching:

  ```sh
  pnpm dev:watch
  ```

---

## 🔄 Migration from Webpack

1. **Remove old Webpack config and plugins** (if present):
   - Ignore `webpack.config.js`, any custom watcher plugins, and related scripts.
2. **Ensure Vite plugins are present** in your `plugins/` directory:
   - `vite-builder.ts` - Main Vite builder class
   - `vite.dev.ts` - Development entry point
   - `vite.prod.ts` - Production build entry point
   - `fake-watcher.ts` - Salla preview compatibility
   - `salla-vite-style-dev-plugin.ts` - Style development plugin
   - `salla-vite-script-dev-plugin.ts` - Script development plugin
   - `salla-vite-prod-plugin.ts` - Production build plugin
   - `utils/` folder with helper files:
     - `hmr-client..ts` - HMR WebSocket client
     - `logger.ts` - Logging utilities
     - `build-tools.ts` - Build helper functions
     - `helper-plugins.ts` - Plugin utilities
     - `tools.ts` - General utility functions
     - `globals.ts` - Global constants and types
   - `types/` folder with TypeScript definitions:
     - `declarations.d.ts` - Type declarations
     - `globals.d.ts` - Global type definitions
3. **Update your scripts** in `package.json` to use Vite commands (`dev`, `prod`, etc.).
4. **Test your workflow**:
   - Run both `salla theme preview` and `pnpm dev` in separate terminals.
   - Edit a `.twig` file and confirm instant preview updates.

---

## ⚙️ Configuration & Customization

- **Debug Logging**: `NODE_ENV=debug pnpm dev` for verbose output.
- **Custom WebSocket Port**: Set `WS_PORT=xxxx salla theme preview` if your preview runs on a non-default port.
- **Entry Points**: The plugin auto-detects all main JS entrypoints in `src/js/_output/`.
- **Image Assets**: Place images in `src/assets/images/` for auto-copying to `public/images/`.
- **Style Management**: SCSS files are automatically compiled and optimized.

---

## 🧩 Best Practices & Tips

- **Always start with `salla theme preview`**. The plugin needs the CLI config to sync and reload correctly.
- **If preview doesn't update**: Check logs for sync errors, ensure WebSocket is connected, and verify your draft ID matches.
- **For rapid file changes**: The plugin debounces and queues syncs, so you never overload the Salla servers.
- **Debugging**: Use `pnpm dev:debug` for detailed logs about file watching, sync queue, and WebSocket events.
- **Production builds**: Use `pnpm prod` for optimized production assets.

---

## ❓ FAQ

**Q: Do I need to run the Vite watcher manually?**
A: **Yes!** You need to run both `salla theme preview` and `pnpm dev` in separate terminals.

**Q: Why do I need to run `salla theme preview` first?**
A: The plugin relies on the Salla CLI config (theme/store/draft IDs, upload URL, WebSocket port) generated by the preview command.

**Q: What if .twig changes don't show up?**
A: Ensure the sync completes (check logs), the WebSocket is connected, and your browser is loading the correct draft. Try restarting both the preview and Vite server if needed.

**Q: How does the plugin handle multiple rapid file changes?**
A: All changes are debounced and queued, so only the latest version of each file is synced, and reload happens after all syncs complete.

**Q: Can I use this in production?**
A: Yes! For production builds, use `pnpm prod` to generate optimized assets in `public/`.

**Q: What's the difference between `dev` and `dev:watch`?**
A: `dev` runs once and exits, while `dev:watch` automatically restarts when you make changes to the plugin files themselves.

---

## 🛠️ Troubleshooting

- **WebSocket connection failed**: Make sure `salla theme preview` is running and the port is correct.
- **Salla config not found**: Run `salla theme preview` in your project root.
- **Sync failed**: Check your internet connection, Salla CLI authentication, and that the file path is correct.
- **Build errors**: Check for syntax errors in your JS/SCSS/Twig files.
- **Preview not updating**: Try a hard refresh in your browser, or restart both preview and Vite servers.
- **TypeScript errors**: Ensure all dependencies are installed with `pnpm install`.

---

## 🤝 Contribution & Extensibility

Want to extend or improve the plugin? PRs are welcome! The code is modular and well-commented. Ideas for new features, improved error handling, or advanced asset management are encouraged.

**Key files to understand:**

- `plugins/vite-builder.ts` - Main Vite builder implementation
- `plugins/utils/` - Utility functions and helpers
- `plugins/types/` - TypeScript type definitions

---

## 🙏 Credits & Acknowledgements

- Inspired by the original Salla Webpack watcher plugin.
- Thanks to the Salla developer community for feedback and testing.
- Built by Mahmoud Gad with 💙 for Salla theme creators.

---

For more help, join the [Salla Developer Community](https://t.me/salladev) or check the [official documentation](https://docs.salla.dev/).
