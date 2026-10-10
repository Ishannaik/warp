import { expect } from "@playwright/test";
import { codeToAlias } from "../../../shared/codewords.js";
import { test } from "../fixtures";
import { markBrowserStack } from "./browserstackStatus";
import { openSenderRoom, waitForSession } from "./session";

test.afterEach(markBrowserStack);

test("a dashed word alias joins the real room", async ({ sender, receiver }) => {
  const code = await openSenderRoom(sender);
  const alias = codeToAlias(code);
  if (!alias) throw new Error(`codeToAlias returned null for ${code}`);

  await receiver.goto(`/r/${alias}`);
  // #339: sanitize() used to mash the words into a different valid code.
  await expect(receiver.getByTestId("room-code")).toHaveText(code, { timeout: 30_000 });
  const segment = decodeURIComponent(new URL(receiver.url()).pathname.replace(/^\/r\//, ""));
  expect(segment === alias || segment === code, `receiver URL segment was ${segment}`).toBe(true);

  await waitForSession(sender, receiver);
});
