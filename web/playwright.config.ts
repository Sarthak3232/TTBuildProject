import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "npm run dev -- --port 3100",
      url: "http://127.0.0.1:3100/sign-in",
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "isolated-browser-test-key",
      },
    },
    ...(existsSync(`${__dirname}/tests/e2e/tracking-harness/server.mjs`)
      ? [{
          command: "node tests/e2e/tracking-harness/server.mjs",
          url: "http://127.0.0.1:3101",
          reuseExistingServer: false,
          timeout: 30000,
        }]
      : []),
  ],
});
