/**
 * Durable receive-ledger — the reload-survival layer for resume (issue #36).
 *
 * Warp already resumes an interrupted receive across a TRANSPORT drop: the durable
 * sink (IDB / OPFS / disk) lives in the hook-owned registry (`receiveRegRef` in
 * useWarpTransfer.ts), the sender never gives up and re-offers the same file with
 * the same `resumeToken`, and `handleIncomingOffer` auto-resumes any inactive
 * registry entry whose key + token match — reporting `sink.bytesWritten` as the
 * offset. All of that is in-memory, so it dies on a full tab reload: at 90% of a
 * 40 GB receive, F5 costs you everything.
 *
 * The fix is small because the resume protocol was built peer-id-agnostic. The
 * registry just needs to be REPOPULATED from durable storage on mount; the existing
 * auto-resume path does the rest. This module is that durable memory: one compact
 * row per active receive, written only when bytes are durable, read back at
 * `/r/:code` on mount, deleted on completion / decline / cancel, and TTL-expired.
 *
 * Design choices:
 *   - SEPARATE database ("warp-rx-ledger"), not a new store in idbStage's "warp"
 *     DB. Adding a store means a schema version bump, and an IndexedDB connection
 *     that requests an OLDER version than the DB's current one fails with a
 *     VersionError — sharing the DB would break idbStage.ts's version-1 open the
 *     first time the ledger migrated. A sibling database has no such coupling.
 *   - keyPath is the file identity `key` (the same `fileKey` the registry is keyed
 *     by), so an upsert on progress replaces the prior row in place and a remove on
 *     completion targets exactly one file. Rows are tiny (one per in-flight receive,
 *     not per chunk), so `readRxLedger` can getAll + filter by room in JS — no index
 *     needed, unlike the staging store which holds thousands of chunk rows.
 *   - Every call is BEST-EFFORT and swallows errors. The ledger is an optimization
 *     (reload-resume); a blocked IDB must never break a live transfer or a mount.
 *
 * Correctness invariant (mirrors the sinks — Fable H1): a row's `bytesWritten` is
 * only ever written from the sink's durable count, so the ledger can never claim
 * more than is actually staged. A reload that trusts it therefore resumes at a byte
 * that is really there — never a hole.
 */

const DB_NAME = "warp-rx-ledger";
const DB_VERSION = 1;
const LEDGER = "ledger"; // keyPath "key"; value RxLedgerRow

/** Which durable sink staged the bytes — decides how a reload reconstructs it. */
export type LedgerSinkKind = "idb" | "opfs";

/**
 * One active receive's durable coordinates. `key` is the file identity (registry
 * key); `fileId` is the staging name the sink used (the idbSink/opfsSink key), so a
 * reload reconstructs the SAME sink over the SAME staged bytes. `resumeToken` is the
 * sender's token — a re-offer must still present it to auto-resume (H5), so a stale
 * ledger row can't be hijacked into resuming the wrong transfer.
 */
export interface RxLedgerRow {
  key: string;
  room: string;
  fileId: string;
  resumeToken: string;
  size: number;
  bytesWritten: number;
  sinkKind: LedgerSinkKind;
  mime: string;
  name: string;
  ts: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEDGER)) {
        db.createObjectStore(LEDGER, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function store(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(LEDGER, mode).objectStore(LEDGER);
}

function reqDone<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/**
 * Upsert a receive's durable coordinates. Called on accept (bytesWritten 0) and
 * again as durable progress lands, so the row always reflects what's staged.
 * Best-effort: a failure here only costs a future reload-resume, never the live
 * transfer.
 */
export async function putRxLedger(row: RxLedgerRow): Promise<void> {
  try {
    const db = await openDb();
    await reqDone(store(db, "readwrite").put(row));
  } catch {
    /* IDB unavailable — reload-resume is best-effort */
  }
}

/**
 * Every ledger row for one room, in no particular order. Read once on mount at
 * `/r/:code` to repopulate the receive registry. Rows for other rooms are ignored
 * (a device may hold partials from several rooms). Best-effort: returns [] on any
 * failure so mount proceeds with an empty ledger (fresh accepts, no resume).
 */
export async function readRxLedger(room: string): Promise<RxLedgerRow[]> {
  try {
    const db = await openDb();
    const rows = (await reqDone(store(db, "readonly").getAll())) as RxLedgerRow[];
    return rows.filter((r) => r.room === room);
  } catch {
    return [];
  }
}

/** Drop one file's row (completion / decline / cancel). Best-effort. */
export async function removeRxLedger(key: string): Promise<void> {
  try {
    const db = await openDb();
    await reqDone(store(db, "readwrite").delete(key));
  } catch {
    /* already gone / unavailable */
  }
}

/**
 * Prune ledger rows older than a TTL (a receive abandoned mid-flight, sender's tab
 * closed, etc.) so this user-activity data doesn't linger. Call once on startup
 * alongside gcOrphanStaging / gcOrphanOpfs. Cursor walk (one row at a time),
 * best-effort. The TTL is short on purpose — a row is only useful while the sender
 * is still alive to re-offer, and room codes are reclaimed in minutes.
 */
export async function gcRxLedger(ttlMs = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const db = await openDb();
    const cutoff = Date.now() - ttlMs;
    await new Promise<void>((resolve, reject) => {
      const req = store(db, "readwrite").openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve();
          return;
        }
        if (((cursor.value as { ts?: number }).ts ?? 0) < cutoff) cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* IDB unavailable — nothing to prune */
  }
}
