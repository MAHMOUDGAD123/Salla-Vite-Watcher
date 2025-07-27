import type { UserConfig } from "vite";

// This file will be ignored while running vite.build() function with { configFile: false } option
// So, the global config file only used with "vite build" CLI command
export default {
  plugins: [],
} satisfies UserConfig;
