// Browser <-> CLI interop: a real headless Chromium on the Warp web app
// against the `warp` binary, both directions, SHA-256 checked.
//
// Run from web/ (it borrows web's Playwright):
//   pnpm build && pnpm exec vite preview --port 4391 &
//   WARP_SITE=http://localhost:4391 node ../cli/tests/browser-interop.mjs \
//     ../cli/target/release/warp <browser-send|cli-send> [bytes]
//
// Env: WARP_SITE (default https://warp.ishannaik.com), PAUSE=1 (pause and
// resume mid-transfer from the browser side), NO_MDNS=1 (Chrome shows raw
// host IPs; needed on hosts without multicast, e.g. most cloud VMs, where
// `<uuid>.local` candidates can't resolve).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Resolve Playwright from the cwd (web/), not from this file's folder.
const { chromium } = createRequire(path.join(process.cwd(), "noop.js"))("@playwright/test");

const [bin, mode, sizeArg] = process.argv.slice(2);
const SITE = process.env.WARP_SITE ?? "https://warp.ishannaik.com";
const size = Number(sizeArg ?? 3 * 1024 * 1024 + 12345);
const payload = Buffer.alloc(size).map((_, i) => (i * 31 + 7) % 251);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const dir = mkdtempSync(path.join(tmpdir(), "warp-interop-"));
const name = "interop.bin";
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const t0 = Date.now();

const browser = await chromium.launch({ args: process.env.NO_MDNS ? ["--disable-features=WebRtcHideLocalIpsWithMdns"] : [] });
const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
page.on("console", (m) => { if (m.type() === "error") log("browser:", m.text()); });

function runCli(args) {
  const p = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  const grab = (d) => { out += d; process.stdout.write(`  cli| ${d}`.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")); };
  p.stdout.on("data", grab); p.stderr.on("data", grab);
  const done = new Promise((res) => p.on("exit", (code) => res(code)));
  return { p, done, out: () => out };
}

let ok = false;
try {
  if (mode === "browser-send") {
    await page.goto(`${SITE}/send`);
    const srcDir = mkdtempSync(path.join(tmpdir(), "warp-src-"));
    writeFileSync(path.join(srcDir, name), payload);
    await page.setInputFiles('[data-testid="file-input"]', path.join(srcDir, name));
    await page.click('[data-testid="open-channel"]');
    const codeEl = page.getByTestId("room-code");
    await codeEl.filter({ hasText: /^[A-HJ-KM-NP-Z2-9]{6}$/ }).waitFor({ timeout: 30000 });
    const code = (await codeEl.textContent()).trim();
    log("browser code", code);
    const cli = runCli([code, "--yes", "--out", dir]);
    await page.getByText(/Connected/i).first().waitFor({ timeout: 60000 });
    await page.locator('button:has-text("Send")').first().click();
    if (process.env.PAUSE) {
      await page.waitForFunction(() => /\b([2-8]\d)%/.test(document.body.innerText), null, { timeout: 60000 });
      await page.getByRole("button", { name: "Pause transfer" }).click();
      log("paused");
      await page.waitForTimeout(3000);
      await page.getByRole("button", { name: "Resume transfer" }).click();
      log("resumed");
    }
    const exit = await Promise.race([cli.done, new Promise((r) => setTimeout(() => r("timeout"), 400000))]);
    log("cli exit", exit);
    const got = readFileSync(path.join(dir, name));
    ok = got.length === payload.length && sha(got) === sha(payload);
    log("received", got.length, "bytes, hash match:", sha(got) === sha(payload));
  } else {
    const src = path.join(dir, name);
    writeFileSync(src, payload);
    const cli = runCli(["send", src]);
    let code;
    for (let i = 0; i < 300 && !code; i++) {
      const m = cli.out().replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").match(/\b([A-HJ-KM-NP-Z2-9]{6})\b/);
      if (m) code = m[1]; else await new Promise((r) => setTimeout(r, 100));
    }
    log("cli code", code);
    await page.goto(`${SITE}/r/${code}`);
    await page.getByTestId("accept-offer").click({ timeout: 60000 });
    if (process.env.PAUSE) {
      // Pause mid-stream, then resume: the CLI must stop without file-end and
      // re-offer on the resume signal, like the browser sender does.
      await page.waitForFunction(() => /\b([2-8]\d)%/.test(document.body.innerText), null, { timeout: 60000 });
      await page.getByRole("button", { name: "Pause transfer" }).click();
      log("paused");
      await page.waitForTimeout(3000);
      await page.getByRole("button", { name: "Resume transfer" }).click();
      log("resumed");
      const accept = page.getByTestId("accept-offer");
      if (await accept.isVisible({ timeout: 5000 }).catch(() => false)) { await accept.click(); log("re-accepted"); }
    }
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 400000 }),
      page.getByRole("button", { name: "Download", exact: true }).click({ timeout: 400000 }),
    ]);
    const got = readFileSync(await download.path());
    ok = got.length === payload.length && sha(got) === sha(payload);
    log("browser got", got.length, "bytes, hash match:", sha(got) === sha(payload));
    cli.p.kill();
  }
} catch (e) {
  log("FAIL:", e.message.split("\n")[0]);
  await page.screenshot({ path: path.join(dir, "fail.png") });
  log("screenshot", path.join(dir, "fail.png"));
} finally {
  await browser.close();
}
console.log(ok ? "INTEROP OK" : "INTEROP FAIL");
process.exit(ok ? 0 : 1);
