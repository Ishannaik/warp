import { expect } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "../fixtures";
import { markBrowserStack } from "./browserstackStatus";
import { waitForSession } from "./session";

test.afterEach(markBrowserStack);

test("a 3 MiB file arrives with the same SHA-256", async ({ sender, receiver }, testInfo) => {
  // ≥1 MiB so the piece-manifest path is the one under test.
  const payload = randomBytes(3 * 1024 * 1024);
  const name = `warp-prod-${testInfo.project.name}.bin`;
  const expected = createHash("sha256").update(payload).digest("hex");

  await sender.goto("/send");
  await sender.setInputFiles('[data-testid="file-input"]', {
    name,
    mimeType: "application/octet-stream",
    buffer: payload,
  });
  await sender.getByTestId("open-channel").click();
  await expect(sender.getByTestId("room-code")).toHaveText(/^[A-HJ-KM-NP-Z2-9]{6}$/, {
    timeout: 30_000,
  });
  const code = ((await sender.getByTestId("room-code").textContent()) ?? "").trim();

  await receiver.goto(`/r/${code}`);
  await waitForSession(sender, receiver);
  await sender.locator('button:has-text("Send")').first().click();
  await receiver.getByTestId("accept-offer").click();

  const [download] = await Promise.all([
    receiver.waitForEvent("download"),
    receiver.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  // download.path() throws on a remote BrowserStack browser. saveAs writes the
  // bytes to disk on this machine, which is what the hash reads.
  const filePath = testInfo.outputPath("received.bin");
  await download.saveAs(filePath);
  const out = readFileSync(filePath);
  expect(out.length).toBe(payload.length);
  expect(createHash("sha256").update(out).digest("hex")).toBe(expected);
});
