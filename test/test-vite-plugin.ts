// @ts-nocheck

/**
 * Test script for Salla Vite Plugin
 * This script verifies that the plugin can load Salla CLI configuration
 * and connect to the WebSocket server.
 */

import fs from "fs";
import path from "path";
import ws from "websocket";

const { client: wsclient } = ws;

console.log("🧪 Testing Salla Vite Plugin Configuration...\n");

// Test 1: Check if Salla CLI config exists
console.log("1️⃣  Checking Salla CLI configuration...");
const cachePath = path.join(process.cwd(), "/node_modules/.salla-cli");

if (fs.existsSync(cachePath)) {
  try {
    const config = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    console.log("✅ Salla CLI config found:");
    console.log(`   Theme ID: ${config.theme_id}`);
    console.log(`   Store ID: ${config.store_id}`);
    console.log(`   Draft ID: ${config.draft_id}`);
    console.log(`   WebSocket Port: ${config.wsport}`);
    console.log(
      `   Upload URL: ${config.upload_url ? "Configured" : "Missing"}`
    );
  } catch (error) {
    console.log(
      "❌ Failed to parse Salla CLI config:",
      (error as Error).message
    );
  }
} else {
  console.log("❌ Salla CLI config not found");
  console.log("   Make sure to run 'salla theme preview' first");
}

// Test 2: Check if Vite plugin exists
console.log("\n2️⃣  Checking Vite plugin...");
const pluginPath = path.join(process.cwd(), "/plugins/vite-plugin-salla.ts");

if (fs.existsSync(pluginPath)) {
  console.log("✅ Vite plugin found");

  // Check plugin content for key features
  const pluginContent = fs.readFileSync(pluginPath, "utf8");
  const features = [
    { name: "WebSocket connection", pattern: "wsclient" },
    { name: "File watching", pattern: "chokidar" },
    { name: "Sync queue", pattern: "syncQueue" },
    { name: "Debouncing", pattern: "debounce" },
    { name: "Enhanced logging", pattern: "logger" },
  ];

  features.forEach((feature) => {
    if (pluginContent.includes(feature.pattern)) {
      console.log(`   ✅ ${feature.name}`);
    } else {
      console.log(`   ❌ ${feature.name} - not found`);
    }
  });
} else {
  console.log("❌ Vite plugin not found");
}

// Test 3: Check if Vite config exists
console.log("\n3️⃣  Checking Vite configuration...");
const viteConfigPath = path.join(process.cwd(), "/vite.config.ts");

if (fs.existsSync(viteConfigPath)) {
  console.log("✅ Vite config found");

  const configContent = fs.readFileSync(viteConfigPath, "utf8");
  if (configContent.includes("sallaPlugin")) {
    console.log("   ✅ Salla plugin imported");
  } else {
    console.log("   ❌ Salla plugin not imported");
  }
} else {
  console.log("❌ Vite config not found");
}

// Test 4: Check source directories
console.log("\n4️⃣  Checking source directories...");
const directories = [
  { path: "src/assets/js", name: "JavaScript files" },
  { path: "src/assets/styles", name: "SCSS files" },
  { path: "src/views", name: "Twig templates" },
  { path: "src/assets/images", name: "Images" },
];

directories.forEach((dir) => {
  if (fs.existsSync(dir.path)) {
    const files = fs.readdirSync(dir.path);
    console.log(`✅ ${dir.name}: ${files.length} files found`);
  } else {
    console.log(`❌ ${dir.name}: directory not found`);
  }
});

// Test 5: Check package.json scripts
console.log("\n5️⃣  Checking package.json scripts...");
const packagePath = path.join(process.cwd(), "/package.json");

if (fs.existsSync(packagePath)) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const scripts = packageJson.scripts || {};

    const requiredScripts = [
      { name: "development", description: "Vite development mode" },
      { name: "watch", description: "Vite watch mode" },
      { name: "production", description: "Production build" },
    ];

    requiredScripts.forEach((script) => {
      if (scripts[script.name]) {
        console.log(`✅ ${script.description}: ${scripts[script.name]}`);
      } else {
        console.log(`❌ ${script.description}: not found`);
      }
    });
  } catch (error) {
    console.log("❌ Failed to parse package.json:", (error as Error).message);
  }
} else {
  console.log("❌ package.json not found");
}

// Test 6: Optional WebSocket connection test
console.log("\n6️⃣  Testing WebSocket connection (optional)...");
const config = fs.existsSync(cachePath)
  ? JSON.parse(fs.readFileSync(cachePath, "utf8"))
  : null;

if (config && config.wsport) {
  const client = new wsclient();

  client.on("connectFailed", (error) => {
    console.log(`❌ WebSocket connection failed: ${error.toString()}`);
    console.log("   Make sure 'salla theme preview' is running");
  });

  client.on("connect", (connection) => {
    console.log(`✅ WebSocket connected to port ${config.wsport}`);
    connection.close();
  });

  try {
    client.connect(`ws://localhost:${config.wsport}`, "echo-protocol");

    // Timeout after 5 seconds
    setTimeout(() => {
      // @ts-ignore
      if (client.state !== "CONNECTED") {
        console.log("⏰ WebSocket connection timeout");
        console.log(
          "   This is normal if 'salla theme preview' is not running"
        );
      }
    }, 5000);
  } catch (error) {
    console.log(`❌ WebSocket connection error: ${(error as Error).message}`);
  }
} else {
  console.log("⚠️  WebSocket port not configured");
  console.log("   Run 'salla theme preview' to get WebSocket configuration");
}

console.log("\n🎯 Test Summary:");
console.log("If all tests pass, your Vite plugin is ready to use!");
console.log("\n📝 Next steps:");
console.log("1. Run 'salla theme preview' in one terminal");
console.log("2. Run 'npm run watch' in another terminal");
console.log("3. Edit .twig files and see instant updates!");
console.log("\n🚀 Happy coding with Salla!");
