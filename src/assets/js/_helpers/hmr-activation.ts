// Add the hmr logic only on DEV mode
if (import.meta.env.MODE === "development") {
  import("./hmr-tools.ts").then(({ prepareHMRWS }) => {
    prepareHMRWS();
  });
}