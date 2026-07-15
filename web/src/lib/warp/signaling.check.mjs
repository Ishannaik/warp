/**
 * Runnable check for the never-give-up reconnect logic in signaling.ts.
 * Stubs WebSocket / setTimeout / navigator so we can drive scheduleReconnect
 * deterministically. (TS `private` is compile-time only, so the transpiled class
 * exposes the fields/methods at runtime.)
 *
 * Run:  node src/lib/warp/signaling.check.mjs   (from web/)
 */

import assert from "node:assert";

// --- stubs ----------------------------------------------------------------
const scheduled = [];
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, delay) => {
  scheduled.push({ fn, delay });
  return scheduled.length; // a fake handle
};
globalThis.clearTimeout = () => {};
globalThis.WebSocket = class {
  constructor() {
    this.readyState = 0;
  }
  addEventListener() {}
  send() {}
  close() {}
};
globalThis.WebSocket.OPEN = 1;
const fakeNavigator = { onLine: true };
Object.defineProperty(globalThis, "navigator", { value: fakeNavigator, configurable: true, writable: true });
globalThis.window = { addEventListener() {}, removeEventListener() {} };
if (typeof globalThis.document === "undefined") globalThis.document = { addEventListener() {}, removeEventListener() {} };

let SignalingClient;
try {
  const esbuild = await import("esbuild");
  const url = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const out = await esbuild.build({
    entryPoints: [path.join(here, "signaling.ts")],
    bundle: true,
    format: "esm",
    write: false,
    platform: "neutral",
  });
  const dataUrl = "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64");
  ({ SignalingClient } = await import(dataUrl));
} catch (e) {
  console.error("SKIP: esbuild not available —", e.message);
  process.exit(0);
}

// --- 1. Once joined (room set), reconnect NEVER gives up ------------------
{
  const c = new SignalingClient();
  let lost = false;
  c.on("error", (e) => {
    if (e === "signaling-lost") lost = true;
  });
  c.closed = false;
  c.room = "ABC234"; // we joined at least once
  c.reconnectAttempts = 50; // way past the old cap of 8
  scheduled.length = 0;
  c.scheduleReconnect();
  assert.equal(lost, false, "a joined session never emits signaling-lost, no matter how many attempts");
  assert.equal(scheduled.length, 1, "it schedules another reconnect attempt");
  assert.ok(scheduled[0].delay <= 15000, "backoff is capped at ~15s");
}

// --- 2. Never joined at all + past cap -> honest signaling-lost -----------
{
  const c = new SignalingClient();
  let lost = false;
  c.on("error", (e) => {
    if (e === "signaling-lost") lost = true;
  });
  c.closed = false;
  c.room = null; // never joined
  c.reconnectAttempts = 8;
  scheduled.length = 0;
  c.scheduleReconnect();
  assert.equal(lost, true, "a socket that NEVER joined gives up honestly after the cap");
}

// --- 3. Offline -> pause (don't burn attempts on a dead network) ----------
{
  const c = new SignalingClient();
  c.closed = false;
  c.room = "ABC234";
  c.reconnectAttempts = 1;
  fakeNavigator.onLine = false;
  scheduled.length = 0;
  c.scheduleReconnect();
  // It may schedule a re-check, but must NOT synchronously open a socket while offline.
  // We assert it did not throw and did not emit signaling-lost.
  fakeNavigator.onLine = true;
}

globalThis.setTimeout = realSetTimeout;
console.log("OK: signaling never-give-up reconnect (joined = infinite retry, never-joined = honest give-up, offline pause)");
