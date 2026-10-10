import type { Page } from "@playwright/test";

const CODE = /^[A-HJ-KM-NP-Z2-9]{6}$/;

const ERROR_HEADING = /No direct route|Couldn't reach the room|The channel broke|Connection dropped/;

/** Open a sender room and return the server-minted code. */
export async function openSenderRoom(sender: Page): Promise<string> {
  await sender.goto("/send");
  await sender.getByTestId("open-channel").click();
  const codeBox = sender.getByTestId("room-code");
  await codeBox.waitFor({ timeout: 30_000 });
  const deadline = Date.now() + 30_000;
  let code = "";
  while (Date.now() < deadline) {
    code = ((await codeBox.textContent()) ?? "").trim();
    if (CODE.test(code)) return code;
    await sender.waitForTimeout(200);
  }
  throw new Error(`sender did not show a 6-character room code (last text: ${JSON.stringify(code)})`);
}

async function waitUntilConnectedOrError(page: Page, label: string): Promise<void> {
  const connected = page.getByText("Connected to sender");
  const broken = page.getByRole("heading", { name: ERROR_HEADING });
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };
    connected.waitFor({ timeout: 60_000 }).then(() => finish()).catch((err: unknown) => {
      finish(err instanceof Error ? err : new Error(String(err)));
    });
    broken
      .waitFor({ timeout: 60_000 })
      .then(async () => {
        const title = (await broken.first().textContent())?.trim() || "error";
        finish(new Error(`${label} hit an error screen: ${title}`));
      })
      .catch(() => {
        // The error heading never appeared. The connected wait owns the timeout.
      });
  });
}

/** Both sides are in the session. Receiver copy matches transfer.spec.ts. */
export async function waitForSession(sender: Page, receiver: Page): Promise<void> {
  await waitUntilConnectedOrError(receiver, "receiver");
  const senderError = sender.getByRole("heading", { name: ERROR_HEADING });
  if (await senderError.count()) {
    const title = (await senderError.first().textContent())?.trim() || "error";
    throw new Error(`sender hit an error screen: ${title}`);
  }
  await sender.getByText("Connected · direct P2P").waitFor({ timeout: 15_000 });
}
