import { SallaViteBuilder } from "./vite-builder.ts";

const builder = new SallaViteBuilder();
await builder.run();

// On terminal (CRTL + C)
process.once("SIGINT", async () => {
  await builder.stop();
  process.exit(0);
});
