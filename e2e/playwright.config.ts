import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

const devCommand =
  process.platform === "win32"
    ? "npm.cmd run dev -- --host 127.0.0.1 --port 4173"
    : "npm run dev -- --host 127.0.0.1 --port 4173";

const webCwd = fileURLToPath(new URL("../web/", import.meta.url));
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();
const useExternalBaseURL = typeof externalBaseURL === "string" && externalBaseURL.length > 0;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: useExternalBaseURL ? externalBaseURL : "http://127.0.0.1:4173",
    reducedMotion: "reduce",
    trace: "on-first-retry"
  },
  ...(useExternalBaseURL
    ? {}
    : {
        webServer: {
          command: devCommand,
          cwd: webCwd,
          port: 4173,
          reuseExistingServer: !process.env.CI
        }
      }),
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
