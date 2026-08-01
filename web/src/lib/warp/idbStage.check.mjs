/**
 * Runnable check for the OOM-prevention gate in idbStage.ts (estimateFits). This is
 * the crash-prevention core: it must refuse a file too big for the device instead of
 * letting the tab OOM-crash. idbSink's write path is covered separately by
 * idbStage.sink.check.mjs (issue #111), which drives it against an in-memory IDB.
 *
 * Run:  node src/lib/warp/idbStage.check.mjs   (from web/)
 */

import assert from "node:assert";

const GB = 1024 * 1024 * 1024;

// Stub navigator (read-only in Node) with a controllable UA + storage.estimate.
const nav = { userAgent: "", maxTouchPoints: 0, storage: { estimate: async () => ({ quota: 0, usage: 0 }) } };
Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });

let estimateFits, storageFits;
try {
  const esbuild = await import("esbuild");
  const url = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const out = await esbuild.build({
    entryPoints: [path.join(here, "idbStage.ts")],
    bundle: true,
    format: "esm",
    write: false,
    platform: "neutral",
  });
  const dataUrl = "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64");
  ({ estimateFits, storageFits } = await import(dataUrl));
} catch (e) {
  console.error("SKIP: esbuild not available —", e.message);
  process.exit(0);
}

// --- iOS hard memory cap: refuse a multi-GB file even if storage says fine --------
nav.userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
nav.maxTouchPoints = 5;
nav.storage.estimate = async () => ({ quota: 100 * GB, usage: 0 }); // tons of storage...
let r = await estimateFits(3 * GB);
assert.equal(r.ok, false, "iOS refuses a 3 GB file (memory ceiling) despite ample storage quota");
assert.ok(r.reason && /desktop/i.test(r.reason), "iOS refusal is honest and suggests a desktop browser");

// small file on iOS is fine
r = await estimateFits(50 * 1024 * 1024);
assert.equal(r.ok, true, "iOS accepts a small (50 MB) file");

// --- desktop: gated purely on the storage estimate --------------------------------
nav.userAgent = "Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0";
nav.maxTouchPoints = 0;
nav.storage.estimate = async () => ({ quota: 2 * GB, usage: 1.8 * GB }); // ~200 MB free
r = await estimateFits(1 * GB); // needs ~1.5 GB free -> refuse
assert.equal(r.ok, false, "desktop refuses when the storage estimate can't fit the file (+headroom)");

nav.storage.estimate = async () => ({ quota: 50 * GB, usage: 1 * GB }); // plenty free
r = await estimateFits(3 * GB);
assert.equal(r.ok, true, "desktop accepts a 3 GB file when storage has room");

// --- estimate unavailable -> optimistic (the write will surface a real quota error)
nav.storage = {};
r = await estimateFits(3 * GB);
assert.equal(r.ok, true, "with no storage.estimate API, we don't pre-refuse (the write reports quota)");

// --- storageFits: QUOTA-only gate, no iOS memory cap (the OPFS sink's gate) -------
// OPFS streams chunks straight to a bucket file with no in-RAM Blob-of-Blobs
// assembly, so it gates on storageFits (quota alone) and must NOT inherit
// estimateFits' iOS memory cap — that divergence is exactly what lets iOS receive
// larger files on the OPFS path than the IDB path honestly could.
nav.userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";
nav.maxTouchPoints = 5;
nav.storage = { estimate: async () => ({ quota: 100 * GB, usage: 0 }) }; // ample quota
r = await storageFits(3 * GB);
assert.equal(r.ok, true, "storageFits ignores the iOS memory cap: 3 GB fits when quota has room");
r = await estimateFits(3 * GB);
assert.equal(r.ok, false, "estimateFits still refuses that same 3 GB file on iOS — the two gates diverge");

// storageFits is not a no-op: it still enforces the quota (+1.5x headroom) on desktop.
nav.userAgent = "Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0";
nav.maxTouchPoints = 0;
nav.storage.estimate = async () => ({ quota: 2 * GB, usage: 1.8 * GB }); // ~200 MB free
r = await storageFits(1 * GB); // needs ~1.5 GB free -> refuse
assert.equal(r.ok, false, "storageFits refuses when the storage estimate can't fit the file (+headroom)");

console.log("OK: idbStage estimateFits + storageFits gates (iOS memory cap vs quota-only OPFS gate, honest)");
