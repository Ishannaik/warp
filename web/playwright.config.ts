import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

// E2E: real two-browser WebRTC transfer against the local signaling server.
//
// Topology per test run:
//   - `pnpm --filter @warp/server dev` (wrangler dev, workerd, ws://localhost:8787)
//   - `vite preview` serving the production build (webServer #2)
//   - two browser contexts in one Playwright worker: sender + receiver
//
// The signaling URL is pointed at the local server via VITE_SIGNALING_URL at
// build time (see e2e/build.sh), so the preview build talks to localhost only.
export default defineConfig({
  testDir: path.join(root, "tests"),
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // WebKit ≈ Safari engine — warp's real cross-browser risk, covered $0.
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
  use: {
    headless: true,
    baseURL: "http://localhost:4173",
    // Two contexts share one browser instance; logs + traces make a flaky
    // WebRTC failure diagnosable without re-running anything.
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: [
    {
      command: "node scripts/e2e-signaling.mjs",
      url: "http://localhost:8787/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm exec vite preview --port 4173 --strictPort",
      url: "http://localhost:4173/",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
