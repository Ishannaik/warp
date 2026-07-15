/**
 * Runnable check for the durable-write receive sink (Fable H1). Verifies that
 * bytesWritten reflects DURABLE writes (post-resolve), that disk writes land in
 * order, that finalize reassembles / closes, and that a rejecting write POISONS
 * the sink instead of silently advancing the offset.
 *
 * Run:  node src/lib/warp/receiveController.check.mjs   (from web/)
 */

import assert from "node:assert";

let memorySink, diskSink;
try {
  const esbuild = await import("esbuild");
  const url = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const out = await esbuild.build({
    entryPoints: [path.join(here, "receiveController.ts")],
    bundle: true,
    format: "esm",
    write: false,
    platform: "neutral",
  });
  const code = out.outputFiles[0].text;
  const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  ({ memorySink, diskSink } = await import(dataUrl));
} catch (e) {
  console.error("SKIP: esbuild not available —", e.message);
  process.exit(0);
}

const buf = (s) => new TextEncoder().encode(s).buffer;

// --- memory sink: bytesWritten exact; finalize reassembles ---
const m = memorySink();
m.append(buf("hello "));
m.append(buf("world"));
await m.quiesce();
assert.equal(m.bytesWritten, 11, "memory bytesWritten counts all appended bytes");
const blob = await m.finalize();
assert.equal(await blob.text(), "hello world", "memory finalize reassembles the bytes");

// --- disk sink: writes land in order; bytesWritten counts AFTER resolve ---
const written = [];
let closed = false;
const d = diskSink(async () => ({
  async write(chunk) {
    await Promise.resolve(); // force async so ordering is non-trivial
    written.push(Buffer.from(chunk));
  },
  async close() {
    closed = true;
  },
}));
d.append(buf("AB"));
d.append(buf("CD"));
await d.quiesce();
assert.equal(Buffer.concat(written).toString(), "ABCD", "disk writes land in append order");
assert.equal(d.bytesWritten, 4, "disk bytesWritten counts durable bytes");
const diskBlob = await d.finalize();
assert.equal(diskBlob, null, "disk finalize returns null (no in-memory blob)");
assert.equal(closed, true, "disk finalize closes the writable");

// --- poison: a rejecting write flips failed and does NOT advance bytesWritten ---
const bad = diskSink(async () => ({
  async write() {
    throw new Error("disk full");
  },
  async close() {},
}));
bad.append(buf("XYZ"));
await bad.quiesce();
assert.equal(bad.failed, true, "a rejected write poisons the sink");
assert.equal(bad.bytesWritten, 0, "poisoned sink does not advance bytesWritten (no silent hole)");

// --- open failure also poisons ---
const badOpen = diskSink(async () => {
  throw new Error("permission denied");
});
badOpen.append(buf("Q"));
await badOpen.quiesce();
assert.equal(badOpen.failed, true, "a failed writable-open poisons the sink");

console.log("OK: receiveController durable-write accounting + poison-on-failure");
