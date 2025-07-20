import type { UserConfig } from "vite";

// This file will be ignored while running vite.build() function by { configFile: false }
// So, the global config file only used with "vite build --mode production" CLI command
export default {
  plugins: [],
} satisfies UserConfig;
