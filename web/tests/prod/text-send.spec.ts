import { expect } from "@playwright/test";
import { test } from "../fixtures";
import { markBrowserStack } from "./browserstackStatus";
import { waitForSession } from "./session";

test.afterEach(markBrowserStack);

test("text without a file arrives intact", async ({ sender, receiver }, testInfo) => {
  const secret = `warp-text-${Date.now()}-${testInfo.project.name}`;

  await sender.goto("/send");
  await sender.getByLabel("Text to send").fill(secret);
  await sender.getByTestId("open-channel").click();
  const codeBox = sender.getByTestId("room-code");
  await expect(codeBox).toHaveText(/^[A-HJ-KM-NP-Z2-9]{6}$/, { timeout: 30_000 });
  const code = ((await codeBox.textContent()) ?? "").trim();

  await receiver.goto(`/r/${code}`);
  await waitForSession(sender, receiver);

  const sendText = sender.getByRole("button", { name: /Send text/ });
  await expect(sendText).toBeEnabled();
  await sendText.click();

  await expect(receiver.getByText(secret, { exact: true })).toBeVisible({ timeout: 30_000 });
});
