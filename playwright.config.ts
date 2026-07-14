import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: true } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }
  ]
});
