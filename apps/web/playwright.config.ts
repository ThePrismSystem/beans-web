import { defineConfig } from "@playwright/test";

const PORT = 4791;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  globalTeardown: "./e2e/fixtures/global-teardown.mjs",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/fixtures/serve.mjs",
    url: `${BASE_URL}/api/projects`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: String(PORT) },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
