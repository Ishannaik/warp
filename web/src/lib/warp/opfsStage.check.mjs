/**
 * Runnable check for the OPFS receive sink (research-2026-07 P1). The real sink
 * writes through a Worker-held FileSystemSyncAccessHandle, which needs a browser —
 * so here we inject a FAKE OpfsWriter through the sink's seam and assert the parts
 * that matter for correctness and can run in Node:
 *
 *   - opfsSupported() feature detection (getDirectory + Worker prerequisites)
 *   - bytesWritten reflects DURABLE writes (advances only after a write acks)
 *   - writes land in append order and finalize reassembles them
 *   - a rejecting write POISONS the sink (no silent hole); finalize then refuses
 *   - abort closes + removes the staging file
 *
 * Run:  node src/lib/warp/opfsStage.check.mjs   (from web/)
 */

import assert from "node:assert";

// Stub the browser globals opfsSupported() probes. Both are mutable so each case
// can flip them.
const nav = { storage: {} };
Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
class FakeWorker {}
globalThis.Worker = FakeWorker;

let opfsSupported, opfsSink;
try {
  const esbuild = await import("esbuild");
  const url = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const out = await esbuild.build({
    entryPoints: [path.join(here, "opfsStage.ts")],
    bundle: true,
    format: "esm",
    write: false,
    platform: "neutral",
  });
  const dataUrl = "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64");
  ({ opfsSupported, opfsSink } = await import(dataUrl));
} catch (e) {
  console.error("SKIP: esbuild not available —", e.message);
  process.exit(0);
}

const buf = (s) => new TextEncoder().encode(s).buffer;

// --- opfsSupported(): gate on getDirectory + Worker ------------------------------
nav.storage = {}; // no getDirectory
assert.equal(opfsSupported(), false, "no getDirectory -> unsupported");

nav.storage = { getDirectory: async () => ({}) };
const savedWorker = globalThis.Worker;
delete globalThis.Worker;
assert.equal(opfsSupported(), false, "getDirectory but no Worker -> unsupported");
globalThis.Worker = savedWorker;

assert.equal(opfsSupported(), true, "getDirectory + Worker -> supported");

// --- a fake OpfsWriter the sink drives through its seam --------------------------
function fakeWriter(opts = {}) {
  const state = { name: null, writes: [], closed: false, removed: false, toBlobCalls: 0 };
  let count = 0;
  return {
    state,
    async write(b) {
      await Promise.resolve(); // force async so ordering is non-trivial
      count += 1;
      if (opts.failAllWrites) throw new Error("write failed");
      if (opts.failAfter && count > opts.failAfter) throw new Error("write failed");
      state.writes.push(Buffer.from(b));
    },
    async close() {
      await Promise.resolve();
      if (opts.failClose) throw new Error("close failed");
      state.closed = true;
    },
    async toBlob(mime) {
      state.toBlobCalls += 1;
      return new Blob(state.writes, mime ? { type: mime } : undefined);
    },
    async remove() {
      state.removed = true;
    },
  };
}

// --- durable accounting + in-order finalize --------------------------------------
{
  let w;
  const sink = opfsSink("file1", "text/plain", (name) => {
    w = fakeWriter();
    w.state.name = name;
    return w;
  });
  assert.equal(w.state.name, "warp-stage-file1", "staging file is namespaced by prefix + fileId");
  sink.append(buf("hello "));
  sink.append(buf("world"));
  await sink.quiesce();
  assert.equal(sink.bytesWritten, 11, "bytesWritten counts durably-acked bytes");
  assert.equal(Buffer.concat(w.state.writes).toString(), "hello world", "writes land in append order");
  const blob = await sink.finalize();
  assert.equal(await blob.text(), "hello world", "finalize reassembles the staged bytes");
  assert.equal(w.state.closed, true, "finalize closes the writer");
  assert.equal(w.state.removed, false, "finalize keeps the staging file so the handed-out Blob stays valid");
}

// --- poison: a rejecting write flips failed, does NOT advance bytesWritten -------
{
  let w;
  const sink = opfsSink("file2", undefined, (name) => (w = fakeWriter({ failAllWrites: true })));
  sink.append(buf("XYZ"));
  await sink.quiesce();
  assert.equal(sink.failed, true, "a rejected write poisons the sink");
  assert.equal(sink.bytesWritten, 0, "poisoned sink does not advance bytesWritten (no silent hole)");
  const blob = await sink.finalize();
  assert.equal(blob.size, 0, "finalize on a poisoned sink returns an empty Blob (honest refusal)");
  assert.equal(w.state.removed, true, "finalize on a poisoned sink removes the partial staging file");
}

// --- partial success then failure counts only the durable prefix -----------------
{
  const sink = opfsSink("file3", undefined, () => fakeWriter({ failAfter: 1 }));
  sink.append(buf("AB")); // acks -> 2 durable bytes
  sink.append(buf("CD")); // fails -> poison
  await sink.quiesce();
  assert.equal(sink.failed, true, "a mid-stream write failure poisons the sink");
  assert.equal(sink.bytesWritten, 2, "only the bytes written before the failure are counted");
}

// --- a later append after poison is ignored (no resurrection) --------------------
{
  const sink = opfsSink("file4", undefined, () => fakeWriter({ failAllWrites: true }));
  sink.append(buf("X"));
  await sink.quiesce();
  sink.append(buf("Y")); // poisoned -> skipped
  await sink.quiesce();
  assert.equal(sink.bytesWritten, 0, "appends after poison are dropped");
}

// --- abort closes + removes the staging file -------------------------------------
{
  let w;
  const sink = opfsSink("file5", undefined, (name) => (w = fakeWriter()));
  sink.append(buf("data"));
  await sink.quiesce();
  await sink.abort();
  assert.equal(w.state.closed, true, "abort closes the writer");
  assert.equal(w.state.removed, true, "abort removes the staging file (discard the partial)");
}

// --- close failure during finalize poisons + removes -----------------------------
{
  let w;
  const sink = opfsSink("file6", undefined, (name) => (w = fakeWriter({ failClose: true })));
  sink.append(buf("data"));
  await sink.quiesce();
  const blob = await sink.finalize();
  assert.equal(sink.failed, true, "a failed close poisons the sink");
  assert.equal(blob.size, 0, "a failed close yields an empty Blob, not a corrupt file");
  assert.equal(w.state.removed, true, "a failed close removes the partial staging file");
}

console.log("OK: opfsStage feature detection + durable-write accounting + poison-on-failure");
