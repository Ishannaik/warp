import type { Page, TestInfo } from "@playwright/test";

function redact(text: string): string {
  return text
    .replace(/accessKey(?:%22%3A%22|":"|\\":\\")[^"%&\s]+/gi, "accessKey:[redacted]")
    .replace(/wss:\/\/cdp\.browserstack\.com\/playwright\?caps=[^\s'"]+/g, "wss://cdp.browserstack.com/playwright?caps=[redacted]");
}

const BROWSERSTACK_PROJECTS = new Set(["chrome-win11", "webkit-sequoia", "firefox-win11"]);

/** Mark the BrowserStack session. No-op for the local production config. */
export async function markBrowserStack(
  { page }: { page: Page },
  testInfo: TestInfo,
): Promise<void> {
  const onBrowserStack =
    process.env.WARP_BROWSERSTACK === "1" || BROWSERSTACK_PROJECTS.has(testInfo.project.name);
  if (!onBrowserStack) return;
  if (testInfo.status === "skipped") return;

  const status = testInfo.status === "passed" ? "passed" : "failed";
  const reason = redact(testInfo.error?.message ?? status).replace(/\s+/g, " ").slice(0, 240);
  const title = redact(testInfo.title).slice(0, 240);

  const run = async (action: string, args: Record<string, string>) => {
    const payload =
      "browserstack_executor: " + JSON.stringify({ action, arguments: args });
    await page.evaluate(() => {}, payload);
  };

  try {
    await run("setSessionName", { name: title });
    await run("setSessionStatus", { status, reason });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`BrowserStack session status was not set: ${redact(message)}`);
  }
}
