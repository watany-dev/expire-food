import { defineConfig, devices } from "@playwright/test";

const port = 8788;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    // CI は `playwright install chromium` の版を使う。インストール済みの Chromium を使う環境だけ上書きする
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  // iPhone も Chromium で動かす。WebKit は http://localhost の Secure Cookie を保存しないため（ADR 0005）
  projects: [
    { name: "iPhone", use: { ...devices["iPhone 15"], browserName: "chromium" } },
    { name: "Pixel", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "bun e2e/server.ts",
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
  },
});
