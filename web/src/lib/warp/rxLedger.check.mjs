/**
 * Runnable check for rxLedger.ts — the durable receive-ledger that gives resume
 * reload-survival (issue #36). Ships a minimal in-memory IndexedDB implementing
 * exactly the surface rxLedger touches (open/upgrade, transaction.objectStore, put,
 * getAll, delete, openCursor with delete/continue, string keyPath). No new
 * dependency — matches the other *.check.mjs.
 *
 * What it exercises:
 *   - putRxLedger upserts a row in place (progress updates replace, not duplicate);
 *   - readRxLedger returns ONLY the requested room's rows (per-room isolation);
 *   - removeRxLedger drops exactly one file's row (completion / cancel);
 *   - gcRxLedger prunes only rows older than the TTL (cursor walk);
 *   - every call is best-effort: with IDB absent they resolve (never throw) and
 *     readRxLedger yields [].
 *
 * Run:  node src/lib/warp/rxLedger.check.mjs   (from web/)
 */

import assert from "node:assert";

// --- minimal in-memory IndexedDB (string keyPath) -------------------------------
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
    this.keyPath = keyPath; // "key"
    this.records = new Map(); // key -> value
  }
  put(value) {
    const req = new FakeRequest();
    queueMicrotask(() => {
      this.records.set(value[this.keyPath], value);
      req.result = value[this.keyPath];
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }
  delete(key) {
    const req = new FakeRequest();
    queueMicrotask(() => {
      this.records.delete(key);
      req.result = undefined;
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  }
  getAll() {
    const req = new FakeRequest();
    req._fire("onsuccess", Array.from(this.records.values()));
    return req;
  }
  openCursor() {
    const req = new FakeRequest();
    const entries = Array.from(this.records.entries());
    let i = 0;
    const advance = () => {
      if (i >= entries.length) {
        req.result = null;
        if (req.onsuccess) req.onsuccess({ target: req });
        return;
      }
      const [key, value] = entries[i];
      req.result = {
        value,
        delete: () => this.records.delete(key),
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
  transaction() {
    // The ledger DB has a single store; ignore the requested name/mode.
    const store = this.stores.values().next().value;
    return { objectStore: () => store };
  }
}

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

// --- load rxLedger.ts (esbuild-bundled, as the other harnesses do) --------------
let putRxLedger, readRxLedger, removeRxLedger, gcRxLedger;
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
  entryPoints: [path.join(here, "rxLedger.ts")],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const dataUrl = "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64");
({ putRxLedger, readRxLedger, removeRxLedger, gcRxLedger } = await import(dataUrl));

const ledgerStore = () => db.stores.get("ledger");
const row = (key, room, extra = {}) => ({
  key,
  room,
  fileId: "stage-" + key,
  resumeToken: "tok-" + key,
  size: 100,
  bytesWritten: 0,
  sinkKind: "idb",
  mime: "application/octet-stream",
  name: key,
  ts: Date.now(),
  ...extra,
});

// --- 1. put upserts in place (progress replaces, never duplicates) --------------
{
  await putRxLedger(row("vid.mp4|10|42", "ROOM-A", { bytesWritten: 0 }));
  await putRxLedger(row("vid.mp4|10|42", "ROOM-A", { bytesWritten: 6 }));
  assert.equal(ledgerStore().records.size, 1, "a progress update upserts, not duplicates");
  const rows = await readRxLedger("ROOM-A");
  assert.equal(rows.length, 1, "one row for the room");
  assert.equal(rows[0].bytesWritten, 6, "the row reflects the latest durable offset");
}

// --- 2. per-room isolation: readRxLedger returns only the requested room --------
{
  await putRxLedger(row("a.bin|5|1", "ROOM-A"));
  await putRxLedger(row("b.bin|7|2", "ROOM-B"));
  await putRxLedger(row("c.bin|9|3", "ROOM-B"));
  const a = await readRxLedger("ROOM-A");
  const b = await readRxLedger("ROOM-B");
  assert.deepEqual(a.map((r) => r.key).sort(), ["a.bin|5|1", "vid.mp4|10|42"], "room A sees only its rows");
  assert.deepEqual(b.map((r) => r.key).sort(), ["b.bin|7|2", "c.bin|9|3"], "room B sees only its rows");
  assert.deepEqual(await readRxLedger("ROOM-Z"), [], "an unknown room yields no rows");
}

// --- 3. removeRxLedger drops exactly one file's row -----------------------------
{
  await removeRxLedger("a.bin|5|1");
  const a = await readRxLedger("ROOM-A");
  assert.deepEqual(a.map((r) => r.key), ["vid.mp4|10|42"], "remove drops the one completed file");
  const b = await readRxLedger("ROOM-B");
  assert.equal(b.length, 2, "other rooms' rows are untouched");
}

// --- 4. gcRxLedger prunes only rows older than the TTL --------------------------
{
  // Backdate room B's rows as an abandoned session would leave them.
  for (const v of ledgerStore().records.values()) {
    if (v.room === "ROOM-B") v.ts = Date.now() - 48 * 60 * 60 * 1000; // 2 days old
  }
  await gcRxLedger(24 * 60 * 60 * 1000);
  assert.deepEqual(await readRxLedger("ROOM-B"), [], "GC prunes the stale room-B rows");
  assert.deepEqual(
    (await readRxLedger("ROOM-A")).map((r) => r.key),
    ["vid.mp4|10|42"],
    "GC keeps the fresh room-A row",
  );
}

// --- 5. best-effort: with IDB absent, calls resolve and read yields [] ----------
{
  const savedIdb = globalThis.indexedDB;
  globalThis.indexedDB = {
    open() {
      const req = new FakeRequest();
      queueMicrotask(() => req.onerror && req.onerror({ target: req }));
      req.error = new Error("IDB blocked");
      return req;
    },
  };
  await putRxLedger(row("x.bin|1|1", "ROOM-X")); // must not throw
  await removeRxLedger("x.bin|1|1"); // must not throw
  await gcRxLedger(); // must not throw
  assert.deepEqual(await readRxLedger("ROOM-X"), [], "readRxLedger yields [] when IDB is unavailable");
  globalThis.indexedDB = savedIdb;
}

console.log("OK: rxLedger — upsert, per-room isolation, single-row remove, TTL GC, best-effort under IDB failure");
