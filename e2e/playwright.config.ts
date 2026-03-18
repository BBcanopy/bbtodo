import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const devCommand =
  process.platform === "win32"
    ? "npm.cmd run dev -- --host 127.0.0.1 --port 4173"
    : "npm run dev -- --host 127.0.0.1 --port 4173";

const webCwd = fileURLToPath(new URL("../web/", import.meta.url));

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry"
  },
  webServer: {
    command: devCommand,
    cwd: webCwd,
    port: 4173,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
