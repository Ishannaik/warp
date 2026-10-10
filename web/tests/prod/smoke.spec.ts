import { expect, test } from "@playwright/test";
import { markBrowserStack } from "./browserstackStatus";

test.afterEach(markBrowserStack);

const routes = [
  { path: "/", heading: "Send it" },
  { path: "/send", heading: "What are you sending?" },
  { path: "/receive", heading: "Receive a file" },
  { path: "/how", heading: "No server" },
] as const;

for (const route of routes) {
  test(`${route.path} returns 200, shows its heading, and does not scroll sideways`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const response = await page.goto(route.path);
    expect(response, `${route.path} returned no response`).not.toBeNull();
    expect(response!.status(), route.path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(route.heading);
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, `${route.path} scrolls sideways at 360px`).toBe(true);
  });
}
