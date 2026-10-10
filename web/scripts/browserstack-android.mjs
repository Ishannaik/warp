// Real Galaxy S23 smoke against the deployed site. One BrowserStack session.
import { _android } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

function playwrightVersion() {
  const pkgPath = require.resolve("@playwright/test/package.json");
  const parsed = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (!parsed || typeof parsed.version !== "string" || parsed.version.length === 0) {
    throw new Error("Could not read the installed @playwright/test version");
  }
  return parsed.version;
}

function redact(text) {
  return String(text)
    .replace(/accessKey(?:%22%3A%22|":"|\\":\\")[^"%&\s]+/gi, "accessKey:[redacted]")
    .replace(/wss:\/\/cdp\.browserstack\.com\/playwright\?caps=[^\s'"]+/g, "wss://cdp.browserstack.com/playwright?caps=[redacted]");
}

function sessionPayload(status, reason) {
  return (
    "browserstack_executor: " +
    JSON.stringify({
      action: "setSessionStatus",
      arguments: { status, reason: redact(reason).replace(/\s+/g, " ").slice(0, 240) },
    })
  );
}

const username = process.env.BROWSERSTACK_USERNAME ?? "";
const accessKey = process.env.BROWSERSTACK_ACCESS_KEY ?? "";
if (!username || !accessKey) {
  console.error("Skipping Android: set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY.");
  process.exit(0);
}

const baseURL = (process.env.WARP_BASE_URL || "https://warp.ishannaik.com").replace(/\/$/, "");
const commit = process.env.TRAVIS_COMMIT ?? "local";
const caps = {
  browser: "chrome",
  device: "Samsung Galaxy S23",
  os_version: "13.0",
  realMobile: "true",
  name: "warp android /send",
  build: `warp ${commit.slice(0, 7)}`,
  "browserstack.username": username,
  "browserstack.accessKey": accessKey,
  "client.playwrightVersion": playwrightVersion(),
};
const wsEndpoint = `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`;

let device;
let context;
let page;

try {
  device = await _android.connect(wsEndpoint, { timeout: 120_000 });
  context = await device.launchBrowser();
  page = await context.newPage();
  const response = await page.goto(`${baseURL}/send`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  if (!response) throw new Error("GET /send returned no response");
  if (!response.ok()) throw new Error(`GET /send failed with status ${response.status()}`);

  const textbox = page.getByRole("textbox", { name: "Text to send" });
  await textbox.waitFor({ state: "visible", timeout: 30_000 });

  const paste = page.getByRole("button", { name: /paste from clipboard/i });
  try {
    await paste.waitFor({ state: "visible", timeout: 15_000 });
  } catch (err) {
    const clip = await page.evaluate(() => {
      const c = navigator.clipboard;
      return `clipboard=${typeof c}; readText=${Boolean(c && "readText" in c)}`;
    });
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Paste from clipboard is not visible (${clip}). ${message}`);
  }

  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  if (!fits) throw new Error("/send scrolls sideways on Galaxy S23");

  await page.evaluate(() => {}, sessionPayload("passed", "/send shows the text box and Paste from clipboard, with no sideways scroll"));
  console.log("Android /send smoke passed");
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Android smoke failed: ${redact(message)}`);
  if (page) {
    try {
      await page.evaluate(() => {}, sessionPayload("failed", message));
    } catch (statusErr) {
      const statusMessage = statusErr instanceof Error ? statusErr.message : String(statusErr);
      console.error(`Could not set the BrowserStack session status: ${redact(statusMessage)}`);
    }
  }
  process.exitCode = 1;
} finally {
  const force = setTimeout(() => {
    console.error("Timed out closing the Android session");
    process.exit(process.exitCode ?? 1);
  }, 30_000);
  try {
    if (context) await context.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to close the browser: ${redact(message)}`);
  }
  try {
    if (device) await device.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to close the device: ${redact(message)}`);
  }
  clearTimeout(force);
}
