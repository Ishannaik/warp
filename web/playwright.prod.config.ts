import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

// Live site + live signaling worker. Nothing is booted locally.
const baseURL = process.env.WARP_BASE_URL || "https://warp.ishannaik.com";

export default defineConfig({
  testDir: path.join(root, "tests", "prod"),
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "line",
  use: {
    headless: true,
    baseURL,
    trace: "retain-on-failure",
    video: "off",
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // This VM has no multicast, so mDNS host candidates (.local) never
        // resolve between two contexts. Advertising the real host IP lets the
        // two browsers connect without a TURN relay.
        launchOptions: {
          args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
        },
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
