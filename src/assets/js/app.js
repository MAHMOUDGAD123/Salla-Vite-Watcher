// .....
// import AppHelpers from "./app-helpers";

// Add the hmr logic only on DEV mode
if (import.meta.env.MODE === "development") {
  import("./_helpers/hmr-tools.ts").then(({ prepareHMRWS }) => {
    prepareHMRWS();
  });
}

// class App extends AppHelpers {}