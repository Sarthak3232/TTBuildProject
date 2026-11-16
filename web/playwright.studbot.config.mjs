import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e", testMatch: "studbot.spec.mjs", workers: 1,
  outputDir: "test-results/studbot", timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3101", headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {} },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: { command: "node tests/e2e/tracking-harness/server.mjs",
    url: "http://127.0.0.1:3101", reuseExistingServer: false, timeout: 30000 },
});
