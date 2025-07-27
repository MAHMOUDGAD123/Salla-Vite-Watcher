import { Logger } from "./utils/logger.ts";

Logger.success("Salla preview is running.....");

// On terminal (CRTL + C)
process.once("SIGINT", () => {
  Logger.info("Salla preview stopped\n");
  process.exit(0);
});

// Keep the process running 😎
setInterval(() => {}, 1000);