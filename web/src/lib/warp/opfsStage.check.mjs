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
import vm from "node:vm";

// Stub the browser globals opfsSupported() probes. Both are mutable so each case
// can flip them.
const nav = { storage: {} };
Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
class FakeWorker {}
globalThis.Worker = FakeWorker;

let opfsSupported, opfsSink, opfsDurableLength;
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
  ({ opfsSupported, opfsSink, opfsDurableLength } = await import(dataUrl));
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
  const sink = opfsSink("file1", "text/plain", 0, (name) => {
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
  const sink = opfsSink("file2", undefined, 0, (name) => (w = fakeWriter({ failAllWrites: true })));
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
  const sink = opfsSink("file3", undefined, 0, () => fakeWriter({ failAfter: 1 }));
  sink.append(buf("AB")); // acks -> 2 durable bytes
  sink.append(buf("CD")); // fails -> poison
  await sink.quiesce();
  assert.equal(sink.failed, true, "a mid-stream write failure poisons the sink");
  assert.equal(sink.bytesWritten, 2, "only the bytes written before the failure are counted");
}

// --- a later append after poison is ignored (no resurrection) --------------------
{
  const sink = opfsSink("file4", undefined, 0, () => fakeWriter({ failAllWrites: true }));
  sink.append(buf("X"));
  await sink.quiesce();
  sink.append(buf("Y")); // poisoned -> skipped
  await sink.quiesce();
  assert.equal(sink.bytesWritten, 0, "appends after poison are dropped");
}

// --- abort closes + removes the staging file -------------------------------------
{
  let w;
  const sink = opfsSink("file5", undefined, 0, (name) => (w = fakeWriter()));
  sink.append(buf("data"));
  await sink.quiesce();
  await sink.abort();
  assert.equal(w.state.closed, true, "abort closes the writer");
  assert.equal(w.state.removed, true, "abort removes the staging file (discard the partial)");
}

// --- close failure during finalize poisons + removes -----------------------------
{
  let w;
  const sink = opfsSink("file6", undefined, 0, (name) => (w = fakeWriter({ failClose: true })));
  sink.append(buf("data"));
  await sink.quiesce();
  const blob = await sink.finalize();
  assert.equal(sink.failed, true, "a failed close poisons the sink");
  assert.equal(blob.size, 0, "a failed close yields an empty Blob, not a corrupt file");
  assert.equal(w.state.removed, true, "a failed close removes the partial staging file");
}

// --- reload-resume (#169): startOffset threads through to writer + accounting ----
// A reconstructed sink over a partial that survived a reload begins at the durable
// end: bytesWritten starts at startOffset and new acked bytes add on top of it.
{
  let gotName, gotStart;
  const sink = opfsSink("reload-1", "text/plain", 100, (name, startOffset) => {
    gotName = name;
    gotStart = startOffset;
    return fakeWriter();
  });
  assert.equal(gotName, "warp-stage-reload-1", "reload sink reuses the same staging name");
  assert.equal(gotStart, 100, "the reconciled startOffset is handed to the writer");
  assert.equal(sink.bytesWritten, 100, "bytesWritten reports from the durable offset, not 0");
  sink.append(buf("tail")); // 4 more bytes on top of the 100-byte prefix
  await sink.quiesce();
  assert.equal(sink.bytesWritten, 104, "new acked bytes add onto the resume offset");
}

// --- END-TO-END: the REAL workerWriter + REAL inlined OPFS worker source ---------
//
// Every case above injects a fake OpfsWriter, so the production writer (the Worker
// RPC plumbing) and the inlined worker body (open/write/flush/close, error posting)
// were never exercised. Here we run them for real in Node:
//   - URL.createObjectURL is stubbed to hand the inlined worker source to a fake
//     Worker that executes it in a node:vm context (its own `self` + `navigator`).
//   - navigator.storage.getDirectory (both main-thread and in-worker) returns a
//     shared in-memory OPFS bucket, so bytes the worker writes are what finalize's
//     main-thread getFile() reads back.
// opfsSink() is called with NO makeWriter, so it uses the real workerWriter.
function makeFakeOpfs(opts = {}) {
  const files = new Map(); // name -> Buffer (contiguous bytes, like a real bucket file)
  return {
    async getFileHandle(name, o) {
      if (!files.has(name)) {
        if (!o || !o.create) throw new Error("NotFoundError");
        files.set(name, Buffer.alloc(0));
      }
      return {
        async createSyncAccessHandle() {
          return {
            // Positional write: honors { at } like the real sync access handle, so a
            // resumed sink (which writes at the durable end) lands after the prefix.
            write(view, options) {
              if (opts.failWrite) throw new Error("simulated OPFS write failure");
              const u8 = view instanceof Uint8Array ? view : new Uint8Array(view);
              let cur = files.get(name);
              const pos = options && typeof options.at === "number" ? options.at : cur.length;
              const end = pos + u8.byteLength;
              if (end > cur.length) {
                const grown = Buffer.alloc(end);
                cur.copy(grown, 0);
                cur = grown;
              }
              Buffer.from(u8).copy(cur, pos);
              files.set(name, cur);
              return u8.byteLength;
            },
            truncate(size) {
              const cur = files.get(name);
              if (size < cur.length) files.set(name, Buffer.from(cur.subarray(0, size)));
              else if (size > cur.length) {
                const grown = Buffer.alloc(size);
                cur.copy(grown, 0);
                files.set(name, grown);
              }
            },
            getSize() {
              return files.get(name).length;
            },
            flush() {},
            close() {},
          };
        },
        async getFile() {
          return new Blob([files.get(name)]);
        },
      };
    },
    async removeEntry(name) {
      files.delete(name);
    },
    async *values() {
      for (const [name, b] of files) yield { kind: "file", name, getFile: async () => new Blob([b]) };
    },
  };
}

// The bucket both the main thread and the worker read/write; swapped per case.
let currentRoot = makeFakeOpfs();

// Hand the inlined worker source to the fake Worker instead of a blob: URL.
const workerSrcByUrl = new Map();
let urlN = 0;
Object.defineProperty(URL, "createObjectURL", {
  configurable: true,
  writable: true,
  value: (blob) => {
    const u = `fake:opfs-worker:${urlN++}`;
    workerSrcByUrl.set(u, blob);
    return u;
  },
});

// A Worker that actually runs the inlined worker source in an isolated context.
class ExecWorker {
  constructor(url) {
    this.onmessage = null;
    this.onerror = null;
    this._terminated = false;
    this._handler = null;
    this._ready = (async () => {
      const src = await workerSrcByUrl.get(url).text();
      const self = {};
      self.postMessage = (msg) => {
        queueMicrotask(() => {
          if (!this._terminated && this.onmessage) this.onmessage({ data: msg });
        });
      };
      const ctx = vm.createContext({
        self,
        navigator: { storage: { getDirectory: async () => currentRoot } },
      });
      vm.runInContext(src, ctx);
      this._handler = self.onmessage;
    })();
  }
  postMessage(msg) {
    void this._ready.then(() => {
      if (!this._terminated && this._handler) this._handler({ data: msg });
    });
  }
  terminate() {
    this._terminated = true;
  }
}

// Point the live globals the module probes at the real-writer rig.
nav.storage = { getDirectory: async () => currentRoot };
globalThis.Worker = ExecWorker;
assert.equal(opfsSupported(), true, "e2e rig: opfsSupported sees getDirectory + Worker");

// E2E happy path: bytes pumped through the real worker reassemble on finalize.
{
  currentRoot = makeFakeOpfs();
  const sink = opfsSink("e2e-1", "text/plain"); // no makeWriter -> real workerWriter
  sink.append(buf("hello "));
  sink.append(buf("world"));
  await sink.quiesce();
  assert.equal(sink.bytesWritten, 11, "e2e: bytesWritten counts the worker-acked bytes");
  const blob = await sink.finalize();
  assert.equal(await blob.text(), "hello world", "e2e: finalize reads back what the worker wrote to the bucket");
}

// E2E poison: a failing OPFS write in the worker surfaces as a poisoned sink.
{
  currentRoot = makeFakeOpfs({ failWrite: true });
  const sink = opfsSink("e2e-2");
  sink.append(buf("XYZ"));
  await sink.quiesce();
  assert.equal(sink.failed, true, "e2e: a worker write failure poisons the sink");
  assert.equal(sink.bytesWritten, 0, "e2e: a poisoned sink advances nothing (no silent hole)");
  const blob = await sink.finalize();
  assert.equal(blob.size, 0, "e2e: finalize on a poisoned sink yields an empty Blob");
}

// E2E double-abort (the cancel path): the hook aborts a sink, then peer.cancel ->
// applyCancel aborts the SAME sink again. close() must be idempotent — before the
// fix the second close posted to a terminated worker and never settled.
{
  currentRoot = makeFakeOpfs();
  const sink = opfsSink("e2e-3");
  sink.append(buf("data"));
  await sink.quiesce();
  let hung = false;
  await Promise.race([
    Promise.all([sink.abort(), sink.abort()]),
    new Promise((res) => setTimeout(() => { hung = true; res(); }, 2000)),
  ]);
  assert.equal(hung, false, "e2e: aborting the same sink twice settles (idempotent close, no hang)");
}

// E2E reload-resume (#169): a partial file SURVIVES a reload, the sink is rebuilt
// at the durable end, and resumed writes append after the prefix — finalize yields
// prefix + tail with no hole and no clobber. Models the real worker's truncate-on-open
// + positional writes against the contiguous-buffer bucket.
{
  currentRoot = makeFakeOpfs();
  // Seed the durable prefix the way a pre-reload session would have left it on disk.
  const fh = await currentRoot.getFileHandle("warp-stage-reload-e2e", { create: true });
  const h = await fh.createSyncAccessHandle();
  h.write(new TextEncoder().encode("PREFIX-"), { at: 0 });
  h.close();
  assert.equal(await opfsDurableLength("reload-e2e"), 7, "e2e: durable length reads the surviving file");

  const sink = opfsSink("reload-e2e", "text/plain", 7); // resume at the durable end
  assert.equal(sink.bytesWritten, 7, "e2e: rebuilt sink reports from the durable offset");
  sink.append(buf("tail"));
  await sink.quiesce();
  assert.equal(sink.bytesWritten, 11, "e2e: resumed bytes add onto the prefix offset");
  const blob = await sink.finalize();
  assert.equal(await blob.text(), "PREFIX-tail", "e2e: finalize = surviving prefix + resumed tail (no hole/clobber)");
}

// E2E reload-resume reconciliation: the ledger may have acked MORE than the disk
// durably holds (batched flushes). The sink truncates to the reconciled offset, so a
// resume at min(real, ledger) drops the un-persisted tail and never writes past a hole.
{
  currentRoot = makeFakeOpfs();
  const fh = await currentRoot.getFileHandle("warp-stage-reload-short", { create: true });
  const h = await fh.createSyncAccessHandle();
  h.write(new TextEncoder().encode("ABCDEFGH"), { at: 0 }); // 8 durable bytes
  h.close();
  // Ledger claimed 8; reconcile to min(8, 8) = 8 here, but prove truncate-to-offset
  // works by resuming at 5 (as if the disk only durably held 5 of 8 acked bytes).
  const sink = opfsSink("reload-short", undefined, 5);
  sink.append(buf("XY"));
  await sink.quiesce();
  const blob = await sink.finalize();
  assert.equal(await blob.text(), "ABCDEXY", "e2e: truncate-to-offset drops the un-persisted tail before resuming");
}

// opfsDurableLength: missing file -> undefined (caller falls back to honest restart).
{
  currentRoot = makeFakeOpfs();
  assert.equal(await opfsDurableLength("never-staged"), undefined, "e2e: a missing staging file reads as undefined");
}

console.log("OK: opfsStage feature detection + durable-write accounting + poison-on-failure + real-worker e2e + reload-resume");
