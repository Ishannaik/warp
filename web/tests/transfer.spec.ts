// Real end-to-end transfer: two browsers, one room, actual WebRTC bytes.
//
//   sender   → /send → stage file → open channel
//   receiver → /r/<CODE> → auto-join → accept offer → Download
//   assert the received bytes match what was staged (SHA-256 via node:crypto)
//
// Runs against the production build (`vite preview`) talking to a local
// `wrangler dev` signaling server — same code paths as prod, zero cloud.
import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "./fixtures";

test("sender to receiver transfer delivers identical bytes", async ({
  sender,
  receiver,
}, testInfo) => {
  const payload = Buffer.from(
    // >1 MiB so the piece-manifest path (#137) is exercised, not just raw send.
    Buffer.alloc(1024 * 1024 + 37 * 1024).map((_, i) => (i * 31 + 7) % 251),
  );
  const name = `warp-e2e-${testInfo.project.name}.bin`;

  await sender.goto("/send");
  await sender.setInputFiles('[data-testid="file-input"]', {
    name,
    mimeType: "application/octet-stream",
    buffer: payload,
  });
  await sender.click('[data-testid="open-channel"]');
  // The Pair screen mounts with a "········" placeholder before the server
  // mints the code — poll until the real 6-char code lands.
  await expect(sender.getByTestId("room-code")).toHaveText(
    /^[A-HJ-KM-NP-Z2-9]{6}$/,
    { timeout: 30_000 },
  );
  const code = (await sender.getByTestId("room-code").textContent()) ?? "";

  await receiver.goto(`/r/${code}`);
  // Both sides land in the session once the channel opens (receiver sees
  // "Connected to sender"). The queue stays staged — nothing is offered until
  // the sender hits Send (review-before-send).
  await receiver.getByText(/Connected to sender/).waitFor();
  await sender.locator('button:has-text("Send")').first().click();

  await receiver.getByTestId("accept-offer").click();

  const [download] = await Promise.all([
    receiver.waitForEvent("download"),
    // exact: true skips the "⤓ Download all (.zip)" tray action.
    receiver.getByRole("button", { name: "Download", exact: true }).click(),
  ]);
  const out = readFileSync(await download.path());
  expect(out.length).toBe(payload.length);
  expect(createHash("sha256").update(out).digest("hex")).toBe(
    createHash("sha256").update(payload).digest("hex"),
  );
});
