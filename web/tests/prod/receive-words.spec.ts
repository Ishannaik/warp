import { codeToAlias } from "../../../shared/codewords.js";
import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { markBrowserStack } from "./browserstackStatus";
import { openSenderRoom, waitForSession } from "./session";

test.afterEach(markBrowserStack);

test("five words typed on /receive join the room", async ({ sender, receiver }) => {
  const code = await openSenderRoom(sender);
  const alias = codeToAlias(code);
  if (!alias) throw new Error(`codeToAlias returned null for ${code}`);
  const words = alias.replaceAll("-", " ");

  await receiver.goto("/receive");
  await receiver.getByLabel("Room code").fill(words);
  const connect = receiver.getByRole("button", { name: /Connect/ });
  await expect(connect).toBeEnabled();
  await connect.click();

  await waitForSession(sender, receiver);
});
