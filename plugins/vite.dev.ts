import { SallaViteBuilder } from "./vite-builder.ts";

const builder = new SallaViteBuilder();
await builder.run();

// on terminal (CRTL + C)
process.on("SIGINT", async () => {
  await builder.stop();
  process.exit(0);
});
