# Salla Vite Plugin (`vite-plugin-salla`)

![Vite Plugin in Action](Salla-Vite.png)

A high-performance, modern Vite plugin that supercharges Salla theme development by replacing the legacy Webpack workflow. Enjoy instant hot reloads, robust .twig syncing, and a seamless developer experience tailored for Salla CLI and Twilight themes.

---

## 🚀 Why Use This Plugin?

- **Instant .twig/.json updates**: No more manual syncing or slow reloads—see your template changes reflected in the Salla preview instantly.
- **Lightning-fast builds**: Vite's modern engine is 10–100x faster than Webpack, with minimal memory usage.
- **Zero config migration**: Drop-in replacement for Webpack—no need to change your theme structure or Salla workflow.
- **Rock-solid reliability**: Handles all edge cases of Salla CLI's draft-based preview, including queueing, debouncing, and robust error recovery.

---

## 🧠 How It Works (Deep Dive)

1. **File Watching**

   - Monitors all `src/**/*.twig` and `src/**/*.json` files for changes using a high-performance watcher.
   - Debounces rapid changes (700ms) to avoid redundant syncs.

2. **Sync Queue**

   - Changed files are queued for syncing to prevent race conditions and server overload.
   - Each file is synced via `salla theme sync -f <file>` with the correct theme, store, and draft IDs.
   - Syncs are processed one at a time, with a short delay between each.

3. **WebSocket Reload**

   - After all syncs complete, a reload signal is sent to the Salla preview browser via WebSocket.
   - The preview UI fetches the latest draft, ensuring you always see the most up-to-date templates.
   - Automatic reconnection and error handling ensure reliability even if the preview server restarts.

4. **Asset & Build Management**

   - JS/SCSS entrypoints are auto-configured for Vite.
   - Images in `src/assets/images` are copied to `public/images` only if changed.
   - Ensures `app.scss` is always imported in `app.js` for consistent styling.

5. **Logging & Debugging**
   - Colorful, timestamped logs for all major actions.
   - Enable verbose debug output with `DEBUG=true`.

---

## ✨ Features

- **Automatic .twig/.json sync** on save
- **Debounced file watching** for efficient updates
- **Sync queue** to prevent race conditions
- **WebSocket reload** for instant preview updates
- **Automatic image copying**
- **SCSS import enforcement**
- **Enhanced logging** (info, success, warning, error, debug)
- **Automatic Salla CLI config detection**
- **Graceful error handling and recovery**
- **Zero-config for most projects**

---

## 🛠️ Usage

### 1. Prerequisites

- [Salla CLI](https://www.npmjs.com/package/@salla.sa/cli) installed and authenticated
- Your theme project set up with Twilight and this plugin (default in modern Salla themes)

### 2. Start Salla Preview (Vite Watcher Runs Automatically)

```bash
salla theme preview
```

- **You do NOT need to run `npm run watch` or `pnpm watch` manually.**
- The Salla CLI will automatically start the Vite watcher (`pnpm watch` or equivalent) in the background when you run the preview command.
- Make changes to `.twig`, `.json`, `.js`, or `.scss` files and see them reflected instantly in your Salla preview browser.

### 3. Production Build

```bash
npm run production
# or
pnpm production
```

- Builds all assets to `public/` for deployment.

---

## 🔄 Migration from Webpack

1. **Remove old Webpack config and plugins** (if present):
   - Delete `webpack.config.js`, any custom watcher plugins, and related scripts.
2. **Ensure `vite-plugin-salla` is present** in your `plugins/` directory and referenced in `vite.config.ts`.
3. **Update your scripts** in `package.json` to use Vite commands (`watch`, `development`, `production`).
4. **Test your workflow**:
   - Run `salla theme preview` (this will start the Vite watcher automatically).
   - Edit a `.twig` file and confirm instant preview updates.

---

## ⚙️ Configuration & Customization

- **Debug Logging**: `DEBUG=true salla theme preview` for verbose output.
- **Custom WebSocket Port**: Set `WS_PORT=xxxx salla theme preview` if your preview runs on a non-default port.
- **Entry Points**: The plugin auto-detects all main JS entrypoints in `src/assets/js/`.
- **Image Assets**: Place images in `src/assets/images/` for auto-copying to `public/images/`.

---

## 🧩 Best Practices & Tips

- **Always start with `salla theme preview`**. The plugin needs the CLI config to sync and reload correctly, and this command will start the watcher for you.
- **If preview doesn't update**: Check logs for sync errors, ensure WebSocket is connected, and verify your draft ID matches.
- **For rapid file changes**: The plugin debounces and queues syncs, so you never overload the Salla servers.
- **Debugging**: Use `DEBUG=true salla theme preview` for detailed logs about file watching, sync queue, and WebSocket events.

---

## ❓ FAQ

**Q: Do I need to run `npm run watch` or `pnpm watch` myself?**
A: **No!** The Salla CLI automatically starts the Vite watcher when you run `salla theme preview`.

**Q: Why do I need to run `salla theme preview` first?**
A: The plugin relies on the Salla CLI config (theme/store/draft IDs, upload URL, WebSocket port) generated by the preview command, and this command also starts the watcher.

**Q: What if .twig changes don't show up?**
A: Ensure the sync completes (check logs), the WebSocket is connected, and your browser is loading the correct draft. Try restarting both the preview and Vite server if needed.

**Q: How does the plugin handle multiple rapid file changes?**
A: All changes are debounced and queued, so only the latest version of each file is synced, and reload happens after all syncs complete.

**Q: Can I use this in production?**
A: Yes! For production builds, use `npm run production` to generate optimized assets in `public/`.

---

## 🛠️ Troubleshooting

- **WebSocket connection failed**: Make sure `salla theme preview` is running and the port is correct.
- **Salla config not found**: Run `salla theme preview` in your project root.
- **Sync failed**: Check your internet connection, Salla CLI authentication, and that the file path is correct.
- **Build errors**: Check for syntax errors in your JS/SCSS/Twig files.
- **Preview not updating**: Try a hard refresh in your browser, or restart both preview and Vite servers.

---

## 🤝 Contribution & Extensibility

Want to extend or improve the plugin? PRs are welcome! The code is modular and well-commented. Ideas for new features, improved error handling, or advanced asset management are encouraged.

---

## 🙏 Credits & Acknowledgements

- Inspired by the original Salla Webpack watcher plugin.
- Thanks to the Salla developer community for feedback and testing.
- Built with ❤️ for Salla theme creators.

---

For more help, join the [Salla Developer Community](https://t.me/salladev) or check the [official documentation](https://docs.salla.dev/).
