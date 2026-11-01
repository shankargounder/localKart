import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "journeys.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  expect: { timeout: 30000 },
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
  },
  outputDir: "../../.local/playwright-results",
  reporter: "list",
});
