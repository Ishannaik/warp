import { defineConfig, type Project } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function playwrightVersion(): string {
  const pkgPath = require.resolve("@playwright/test/package.json");
  const parsed: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("version" in parsed) ||
    typeof parsed.version !== "string" ||
    parsed.version.length === 0
  ) {
    throw new Error("Could not read the installed @playwright/test version");
  }
  return parsed.version;
}

type Caps = {
  browser: string;
  os: string;
  os_version: string;
  name: string;
  build: string;
  browser_version?: string;
  "browserstack.username": string;
  "browserstack.accessKey": string;
  "client.playwrightVersion": string;
};

function wsEndpoint(caps: Caps): string {
  return `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`;
}

const username = process.env.BROWSERSTACK_USERNAME ?? "";
const accessKey = process.env.BROWSERSTACK_ACCESS_KEY ?? "";
const hasCreds = username.length > 0 && accessKey.length > 0;

if (!hasCreds) {
  console.error(
    "Skipping BrowserStack: set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY.",
  );
} else {
  // Workers inherit this. Specs mark the session only when it is set.
  process.env.WARP_BROWSERSTACK = "1";
}

const baseURL = process.env.WARP_BASE_URL || "https://warp.ishannaik.com";
const commit = process.env.TRAVIS_COMMIT ?? "local";
const build = `warp ${commit.slice(0, 7)}`;

function project(
  name: string,
  caps: Omit<Caps, "name" | "build" | "browserstack.username" | "browserstack.accessKey" | "client.playwrightVersion">,
): Project {
  const full: Caps = {
    ...caps,
    // The worker connects once, before a test title exists. afterEach renames
    // the session to the running test via setSessionName.
    name,
    build,
    "browserstack.username": username,
    "browserstack.accessKey": accessKey,
    "client.playwrightVersion": playwrightVersion(),
  };
  return {
    name,
    use: {
      // BrowserStack's Playwright endpoint is opened with chromium.connect.
      // The caps.browser field chooses Chrome, WebKit, or Firefox on their grid.
      browserName: "chromium",
      viewport: { width: 1280, height: 720 },
      connectOptions: { wsEndpoint: wsEndpoint(full), timeout: 120_000 },
    },
  };
}

const targets: Project[] = [
  project("chrome-win11", {
    browser: "chrome",
    browser_version: "latest",
    os: "Windows",
    os_version: "11",
  }),
  // BrowserStack dropped playwright-webkit on Sonoma (and Ventura) for current
  // Playwright releases. Sequoia is the supported OS X version for WebKit.
  project("webkit-sequoia", {
    browser: "playwright-webkit",
    os: "OS X",
    os_version: "Sequoia",
  }),
  project("firefox-win11", {
    browser: "playwright-firefox",
    os: "Windows",
    os_version: "11",
  }),
];

export default defineConfig({
  testDir: path.join(root, "tests", "prod"),
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  // One parallel Automate session on this account. Do not raise this.
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "off",
    navigationTimeout: 45_000,
  },
  projects: hasCreds
    ? targets
    : [{ name: "skipped", testMatch: /does-not-match-any-spec/ }],
});
