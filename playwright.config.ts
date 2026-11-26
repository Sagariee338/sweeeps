import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath =
  process.env.CHROME_EXECUTABLE || (existsSync(macChrome) ? macChrome : undefined);

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    browserName: "chromium",
    launchOptions: executablePath ? { executablePath } : {},
  },
});
