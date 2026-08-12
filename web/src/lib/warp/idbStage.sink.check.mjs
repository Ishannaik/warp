/**
 * Runnable check for idbSink's REAL IndexedDB write path (issue #111) — the part
 * idbStage.check.mjs deliberately leaves out (it covers only the estimateFits gate
 * and notes the sink "needs a real IndexedDB"). It doesn't: this harness ships a
 * minimal in-memory IndexedDB that implements exactly the surface idbStage.ts
 * touches (open/upgrade, transaction.objectStore, put, getAll(range), openCursor
 * with delete/continue, IDBKeyRange.bound, compound [fileId, offset] keys with
 * IndexedDB's key ordering). No new dependency — matches the other *.check.mjs.
 *
 * What it exercises, all of which was previously untested:
 *   - the ordered write chain: bytesWritten advances only after each put resolves;
 *   - finalize() assembles the ordered Blob-of-Blobs and clears the staging rows;
 *   - the fileRange PREFIX scan: two files staged interleaved never bleed into each
 *     other's finalize, and clearFile deletes only its own file's rows;
 *   - abort() frees the file's rows;
 *   - a failed put POISONS the sink (failed=true, bytesWritten stops, finalize
 *     returns an empty Blob) — the silent-corruption guard from receiveController;
 *   - gcOrphanStaging() prunes only rows older than the TTL, via the cursor walk.
 *
 * Run:  node src/lib/warp/idbStage.sink.check.mjs   (from web/)
 */

import assert from "node:assert";

// --- minimal in-memory IndexedDB ------------------------------------------------
// Key ordering follows the IndexedDB spec for the types idbStage uses: numbers,
// strings, and arrays (compared element-wise; a prefix array sorts before a longer
// array; an array element outranks a number — which is why the [fileId, []] upper
// bound in fileRange sorts after every [fileId, <offset>]).
function keyRank(v) {
  if (typeof v === "number") return 0;
  if (typeof v === "string") return 1;
  if (Array.isArray(v)) return 2;
  throw new Error("unsupported key type in fake IDB: " + typeof v);
}
function cmpKey(a, b) {
  const ra = keyRank(a);
  const rb = keyRank(b);
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (ra === 2) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
      const c = cmpKey(a[i], b[i]);
      if (c !== 0) return c;
    }
    return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

class FakeRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
    this.onupgradeneeded = null;
  }
  _fire(handler, result) {
    this.result = result;
    queueMicrotask(() => this[handler] && this[handler]({ target: this }));
  }
}

class FakeStore {
  constructor(keyPath) {
    this.keyPath = keyPath; // ["fileId", "offset"]
    this.records = []; // { key, value }, kept sorted by key
  }
  _keyOf(value) {
    return this.keyPath.map((field) => value[field]);
  }
  _inRange(key, range) {
    if (!range) return true;
    return cmpKey(key, range.lower) >= 0 && cmpKey(key, range.upper) <= 0;
  }
  _sorted() {
    return this.records.slice().sort((a, b) => cmpKey(a.key, b.key));
  }
  put(value) {
    const req = new FakeRequest();
    const key = this._keyOf(value);
    queueMicrotask(() => {
      if (globalThis.__idbFailPut && globalThis.__idbFailPut(value)) {
        req.error = new Error("QuotaExceededError (fake)");
        if (req.onerror) req.onerror({ target: req });
        return;
      }
      const existing = this.records.findIndex((r) => cmpKey(r.key, key) === 0);
      if (existing >= 0) this.records[existing] = { key, value };
      else this.records.push({ key, value });
      req.result = key;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }
  getAll(range) {
    const req = new FakeRequest();
    const values = this._sorted().filter((r) => this._inRange(r.key, range)).map((r) => r.value);
    req._fire("onsuccess", values);
    return req;
  }
  openCursor(range) {
    const req = new FakeRequest();
    const snapshot = this._sorted().filter((r) => this._inRange(r.key, range));
    let i = 0;
    const advance = () => {
      if (i >= snapshot.length) {
        req.result = null;
        if (req.onsuccess) req.onsuccess({ target: req });
        return;
      }
      const rec = snapshot[i];
      req.result = {
        value: rec.value,
        delete: () => {
          const idx = this.records.findIndex((r) => cmpKey(r.key, rec.key) === 0);
          if (idx >= 0) this.records.splice(idx, 1);
        },
        continue: () => {
          i += 1;
          queueMicrotask(advance);
        },
      };
      if (req.onsuccess) req.onsuccess({ target: req });
    };
    queueMicrotask(advance);
    return req;
  }
}

class FakeDb {
  constructor() {
    this.stores = new Map();
  }
  get objectStoreNames() {
    return { contains: (name) => this.stores.has(name) };
  }
  createObjectStore(name, opts) {
    const store = new FakeStore(opts.keyPath);
    this.stores.set(name, store);
    return store;
  }
  transaction(name) {
    const store = this.stores.get(name);
    return { objectStore: () => store };
  }
}

// One persistent database across open() calls, so finalize() reads what append()
// staged (exactly like the durable real IDB the sink relies on for reload-resume).
const db = new FakeDb();
globalThis.indexedDB = {
  open() {
    const req = new FakeRequest();
    req.result = db;
    queueMicrotask(() => {
      if (req.onupgradeneeded) req.onupgradeneeded({ target: req });
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  },
};
globalThis.IDBKeyRange = { bound: (lower, upper) => ({ lower, upper }) };

// --- load idbStage.ts (esbuild-bundled, as the other harnesses do) --------------
let idbSink, gcOrphanStaging, idbDurableLength;
let esbuild;
try {
  esbuild = await import("esbuild");
} catch (e) {
  console.error("SKIP: esbuild not available —", e.message);
  process.exit(0);
}
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
({ idbSink, gcOrphanStaging, idbDurableLength } = await import(dataUrl));

const enc = new TextEncoder();
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
const store = () => db.stores.get("staging");

// --- 1. ordered write chain: bytesWritten is durable + finalize reassembles ------
{
  const sink = idbSink("file-A", "text/plain");
  assert.equal(sink.bytesWritten, 0, "starts at zero");
  sink.append(enc.encode("hello ").buffer);
  // Not yet durable: the put is still queued on the write chain.
  sink.append(enc.encode("world").buffer);
  await sink.quiesce();
  assert.equal(sink.bytesWritten, 11, "bytesWritten counts only after the puts resolve");
  assert.equal(sink.failed, false, "no failure");
  const blob = await sink.finalize();
  assert.equal(new TextDecoder().decode(await bytes(blob)), "hello world", "finalize reassembles in order");
  assert.equal(store().records.length, 0, "finalize clears the staging rows");
}

// --- 2. prefix isolation: two files interleaved never bleed into each other ------
{
  const a = idbSink("file-B");
  const b = idbSink("file-C");
  a.append(enc.encode("AAA").buffer);
  b.append(enc.encode("bbb").buffer);
  a.append(enc.encode("AAA").buffer);
  b.append(enc.encode("bbb").buffer);
  await a.quiesce();
  await b.quiesce();
  assert.equal(store().records.length, 4, "both files staged (4 rows)");
  const blobA = await a.finalize();
  assert.equal(new TextDecoder().decode(await bytes(blobA)), "AAAAAA", "file B sees only its own rows");
  assert.equal(store().records.length, 2, "clearFile removed only file B's rows");
  const blobB = await b.finalize();
  assert.equal(new TextDecoder().decode(await bytes(blobB)), "bbbbbb", "file C still intact after B cleared");
  assert.equal(store().records.length, 0, "all rows cleared");
}

// --- 3. abort() frees the file's rows -------------------------------------------
{
  const sink = idbSink("file-D");
  sink.append(enc.encode("partial").buffer);
  await sink.quiesce();
  assert.equal(store().records.length, 1, "staged one row");
  await sink.abort();
  assert.equal(store().records.length, 0, "abort clears the partial");
}

// --- 4. a failed put poisons the sink (the silent-corruption guard) --------------
{
  globalThis.__idbFailPut = (value) => value.fileId === "file-E";
  const sink = idbSink("file-E");
  sink.append(enc.encode("will fail").buffer);
  await sink.quiesce();
  assert.equal(sink.failed, true, "a rejected put poisons the sink");
  assert.equal(sink.bytesWritten, 0, "bytesWritten never advances on a poisoned sink");
  const blob = await sink.finalize();
  assert.equal(blob.size, 0, "finalize on a poisoned sink yields an empty Blob, not a hole");
  globalThis.__idbFailPut = null;
}

// --- 5. gcOrphanStaging prunes only rows older than the TTL ---------------------
{
  const fresh = idbSink("file-F");
  fresh.append(enc.encode("fresh").buffer);
  await fresh.quiesce();
  // Backdate a separate orphan's rows directly, as a crashed session would leave them.
  const old = idbSink("file-G");
  old.append(enc.encode("stale").buffer);
  await old.quiesce();
  for (const rec of store().records) {
    if (rec.value.fileId === "file-G") rec.value.ts = Date.now() - 48 * 60 * 60 * 1000; // 2 days old
  }
  assert.equal(store().records.length, 2, "two rows before GC");
  await gcOrphanStaging(24 * 60 * 60 * 1000);
  const left = store().records.map((r) => r.value.fileId);
  assert.deepEqual(left, ["file-F"], "GC prunes the stale orphan, keeps the fresh row");
}

// --- 6. startOffset: a reconstructed sink resumes over a survived partial (#36) --
{
  // First "session": stage the 6-byte prefix of an 11-byte file, then the tab is
  // reloaded (the sink object is gone, but the IDB rows are durable under fileId).
  const before = idbSink("file-H", "text/plain");
  before.append(enc.encode("hello ").buffer);
  await before.quiesce();
  assert.equal(before.bytesWritten, 6, "prefix durably staged (6 bytes)");
  // No finalize/abort — the reload leaves the rows in place, exactly like a crash.

  // Second "session": reconstruct from the durable offset. bytesWritten starts at
  // the offset (the resume point), new chunks key from there, and finalize assembles
  // the WHOLE file from the surviving prefix + the freshly-staged tail.
  const after = idbSink("file-H", "text/plain", 6);
  assert.equal(after.bytesWritten, 6, "a reconstructed sink reports the durable offset");
  after.append(enc.encode("world").buffer);
  await after.quiesce();
  assert.equal(after.bytesWritten, 11, "the tail advances from the offset");
  const blob = await after.finalize();
  assert.equal(new TextDecoder().decode(await bytes(blob)), "hello world", "finalize reassembles prefix + tail");
  assert.equal(
    store().records.filter((r) => r.value.fileId === "file-H").length,
    0,
    "finalize clears every file-H row (prefix and tail)",
  );
}

// --- 7. idbDurableLength: the contiguous durable prefix a resume may trust -------
// Reload-resume hardening (research-2026-07 §6/P5): the ledger's bytesWritten can
// outlive the staged rows (separate DBs, independent TTL GCs), so the hook reconciles
// the resume offset against the ACTUAL contiguous prefix. These cases pin that
// measurement: it must stop at the first gap and never report a byte past a hole (H1).
{
  // A clean contiguous prefix [0,6) + [6,11) measures its full length.
  const s = idbSink("dl-full", "text/plain");
  s.append(enc.encode("hello ").buffer); // [0,6)
  s.append(enc.encode("world").buffer); // [6,11)
  await s.quiesce();
  assert.equal(await idbDurableLength("dl-full"), 11, "a contiguous prefix measures its full length");
  await s.abort(); // clean up the rows
}

{
  // A gap: [0,6) present, [6,8) missing, [8,11) present -> the prefix stops at 6.
  const head = idbSink("dl-gap", "text/plain", 0);
  head.append(enc.encode("hello ").buffer); // [0,6)
  await head.quiesce();
  const tail = idbSink("dl-gap", "text/plain", 8);
  tail.append(enc.encode("rld").buffer); // [8,11) — note the hole at [6,8)
  await tail.quiesce();
  assert.equal(await idbDurableLength("dl-gap"), 6, "a gap stops the measurement at the contiguous prefix");
}

{
  // A missing first row: only [5,11) staged -> nothing contiguous from 0 -> 0.
  const s = idbSink("dl-nofirst", "text/plain", 5);
  s.append(enc.encode("world").buffer); // [5,11)
  await s.quiesce();
  assert.equal(await idbDurableLength("dl-nofirst"), 0, "a prefix that doesn't start at 0 measures 0");
}

{
  // No rows at all -> 0 (an honest restart, never a throw).
  assert.equal(await idbDurableLength("dl-never-staged"), 0, "an unstaged file measures 0");
}

{
  // THE bug this hardening closes: a GC TTL race reaps the prefix row while a fresher
  // tail row (and, upstream, a fresher ledger row claiming 11) survives. Stage a full
  // [0,6)+[6,11) prefix, backdate ONLY the first row past the TTL, and run GC. The
  // ledger would still say 11, but the durable prefix is now 0 — trusting the ledger
  // would finalize a truncated file. idbDurableLength reports the truth.
  const s = idbSink("dl-race", "text/plain");
  s.append(enc.encode("hello ").buffer); // [0,6)
  s.append(enc.encode("world").buffer); // [6,11)
  await s.quiesce();
  assert.equal(await idbDurableLength("dl-race"), 11, "full prefix before GC");
  for (const rec of store().records) {
    if (rec.value.fileId === "dl-race" && rec.value.offset === 0) {
      rec.value.ts = Date.now() - 48 * 60 * 60 * 1000; // age the prefix row past the TTL
    }
  }
  await gcOrphanStaging(24 * 60 * 60 * 1000); // reaps [0,6), leaves [6,11)
  const offsets = store().records.filter((r) => r.value.fileId === "dl-race").map((r) => r.value.offset);
  assert.deepEqual(offsets, [6], "GC reaped the prefix row, left the tail");
  assert.equal(
    await idbDurableLength("dl-race"),
    0,
    "after the prefix row is reaped, the durable prefix is 0 — not the 11 a stale ledger would claim",
  );
}

// --- 8. finalize() walks a cursor, not getAll(): many rows reassemble in order ---
// finalize() used to getAll() the file's whole prefix range, deserializing every
// staging row into RAM at once — the memory spike this module exists to avoid on
// the iOS/Firefox fallback. It now walks a cursor, accumulating only the file-backed
// Blob parts. Pin that the cursor path still reassembles a MANY-row file byte-exact
// and in key (offset) order, so a regression to an unordered/lossy walk fails here.
{
  const ROWS = 512;
  const s = idbSink("dl-many", "application/octet-stream");
  const expected = [];
  for (let i = 0; i < ROWS; i += 1) {
    const byte = (i * 13 + 1) & 0xff;
    expected.push(byte);
    s.append(new Uint8Array([byte]).buffer);
  }
  await s.quiesce();
  assert.equal(store().records.filter((r) => r.value.fileId === "dl-many").length, ROWS, "every chunk staged");
  const blob = await s.finalize();
  assert.equal(blob.size, ROWS, "finalize reassembles all rows via the cursor walk");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), new Uint8Array(expected), "cursor finalize preserves byte-exact offset order");
  assert.equal(store().records.filter((r) => r.value.fileId === "dl-many").length, 0, "cursor finalize clears the rows");
}

console.log("OK: idbSink write path — durable bytesWritten, ordered finalize (cursor walk), prefix isolation, abort, poison, TTL GC, reload startOffset, idbDurableLength contiguity");
