// Two browser contexts per test: sender + receiver sharing a room.
// The receiver navigates to /r/<code> (the share link path), so no manual
// code entry is involved — same flow as clicking the sender's share link.
import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export { expect };

type Pair = { sender: Page; receiver: Page };

export const test = base.extend<Pair>({
  sender: async ({ browser, baseURL }, use) => {
    // browser.newContext() does not inherit the project baseURL. Without it,
    // page.goto("/send") is an invalid relative URL.
    const ctx = await browser.newContext({ baseURL });
    await use(await ctx.newPage());
    await ctx.close();
  },
  receiver: async ({ browser, baseURL }, use) => {
    const ctx = await browser.newContext({ baseURL });
    await use(await ctx.newPage());
    await ctx.close();
  },
});
