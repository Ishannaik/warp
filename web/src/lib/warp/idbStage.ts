/**
 * IndexedDB fallback for receiving large files on browsers WITHOUT the File System
 * Access API (iOS Safari, Firefox), where accumulating a multi-GB Blob in RAM
 * crashes the tab. Two roles:
 *
 *   1. estimateFits(size) — a pre-accept gate. Refuses an offer that won't fit,
 *      combining navigator.storage.estimate() (a STORAGE quota) with a hard iOS
 *      MEMORY cap (the assembly + download still materialize bytes, and iOS kills
 *      the tab at ~1.5–2 GB with no catchable exception — Fable M4). An honest
 *      refusal beats a silent crash (matches the STUN-only NAT honesty).
 *
 *   2. idbSink(fileId) — a ReceiveSink that stages incoming chunks as **Blob**
 *      values (engines keep Blobs file-backed, so assembly is a lazy Blob-of-Blobs
 *      with no RAM copy — Fable M3), keyed by (fileId, offset). bytesWritten counts
 *      only after each put resolves (durable, like the disk sink). finalize()
 *      assembles the ordered Blob and clears the staging rows.
 *
 * Records survive a reload (IDB is durable), so this path also gives the C+ reload
 * resume nearly for free (Pillar 6): the resume offset is the highest contiguous
 * staged record. gcOrphanStaging() prunes rows from crashed sessions on startup.
 */

import type { ReceiveSink } from "./receiveController";

const DB_NAME = "warp";
const DB_VERSION = 1;
const STAGING = "staging"; // keyPath [fileId, offset]; value { fileId, offset, blob, ts }

/** Conservative memory ceiling for iOS Safari tabs (bytes). Above this, refuse. */
const IOS_HARD_CAP = 1024 * 1024 * 1024; // ~1 GiB

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPhone/iPod, plus iPadOS 13+ which reports as "Macintosh" but is touch-capable.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

/**
 * Storage-QUOTA gate only (no memory cap): is there room in the origin's storage
 * for `size` bytes? Shared by the IDB path and the OPFS sink (opfsStage), both of
 * which count against the same best-effort quota. Returns an honest reason on refusal.
 */
export async function storageFits(size: number): Promise<{ ok: boolean; reason?: string }> {
  const nav = navigator as Navigator & {
    storage?: { estimate?: () => Promise<{ quota?: number; usage?: number }> };
  };
  try {
    const est = await nav.storage?.estimate?.();
    if (est && typeof est.quota === "number") {
      const free = est.quota - (est.usage ?? 0);
      // Leave headroom (assembly briefly needs extra); require ~1.5x.
      if (free < size * 1.5) {
        return { ok: false, reason: "Not enough free storage on this device for a file this large." };
      }
    }
  } catch {
    /* estimate unavailable — fall through and try; the write will surface a quota error */
  }
  return { ok: true };
}

/**
 * Can this device receive a file of `size` bytes on the IDB path? Combines the iOS
 * hard MEMORY cap (the Blob-of-Blobs assembly materializes bytes in RAM) with the
 * storage-quota estimate. Returns an honest reason on refusal. The OPFS sink does
 * NOT use this — it streams in place with no assembly, so it gates on `storageFits`
 * alone and can honestly accept larger files on iOS.
 */
export async function estimateFits(size: number): Promise<{ ok: boolean; reason?: string }> {
  if (isIOS() && size > IOS_HARD_CAP) {
    return { ok: false, reason: "This iPhone/iPad can't receive a file this large — use a desktop browser." };
  }
  return storageFits(size);
}

/** Open (and lazily upgrade) the warp IDB database. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STAGING)) {
        db.createObjectStore(STAGING, { keyPath: ["fileId", "offset"] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STAGING, mode).objectStore(STAGING);
}

function reqDone<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/**
 * Inclusive key range covering every row for one file. The store's compound key is
 * [fileId, offset]; [fileId] sorts before any [fileId, n] (prefix), and [fileId, []]
 * sorts after it (an array outranks any numeric offset), so this is an exact prefix
 * scan. Lets IndexedDB skip every other file's rows instead of a full-store getAll.
 */
function fileRange(fileId: string): IDBKeyRange {
  return IDBKeyRange.bound([fileId], [fileId, []]);
}

/**
 * A ReceiveSink backed by IndexedDB Blob staging. bytesWritten advances only after
 * a chunk is durably put (Fable H1/M3). A QuotaExceededError poisons the sink.
 */
export function idbSink(fileId: string, mime?: string): ReceiveSink {
  let bytes = 0;
  let offset = 0;
  let failed = false;
  let dbP: Promise<IDBDatabase> | null = null;
  const db = () => (dbP ??= openDb());

  // Ordered write chain: each append puts its chunk, then advances bytesWritten.
  let chain: Promise<void> = Promise.resolve();

  return {
    get bytesWritten() {
      return bytes;
    },
    get failed() {
      return failed;
    },
    append(buf) {
      const at = offset;
      offset += buf.byteLength;
      const blob = new Blob([buf]);
      chain = chain
        .then(async () => {
          if (failed) return;
          const d = await db();
          await reqDone(tx(d, "readwrite").put({ fileId, offset: at, blob, ts: Date.now() }));
          bytes = at + buf.byteLength; // durable: only after the put resolves
        })
        .catch(() => {
          failed = true; // quota / IDB error -> poison, never a silent hole
        });
    },
    async quiesce() {
      try {
        await chain;
      } catch {
        /* poison flag set */
      }
    },
    async finalize() {
      await this.quiesce();
      if (failed) return new Blob([], mime ? { type: mime } : undefined);
      const d = await db();
      const rows = (await reqDone(tx(d, "readonly").getAll(fileRange(fileId)))) as Array<{
        fileId: string;
        offset: number;
        blob: Blob;
      }>;
      // Already scoped to this file and returned in key order; sort defensively.
      const mine = rows.sort((a, b) => a.offset - b.offset);
      const blob = new Blob(
        mine.map((r) => r.blob),
        mime ? { type: mime } : undefined,
      );
      await clearFile(d, fileId); // staging done -> free the quota
      return blob;
    },
    async abort() {
      try {
        await chain;
      } catch {
        /* ignore */
      }
      try {
        const d = await db();
        await clearFile(d, fileId);
      } catch {
        /* already gone */
      }
    },
  };
}

/** Delete every staging row for one file. */
async function clearFile(db: IDBDatabase, fileId: string): Promise<void> {
  const store = tx(db, "readwrite");
  const rows = (await reqDone(store.getAllKeys(fileRange(fileId)))) as Array<[string, number]>;
  await Promise.all(rows.map((k) => reqDone(store.delete(k))));
}

/**
 * Prune staging rows older than a TTL (crashed / abandoned sessions) so IDB quota
 * doesn't leak forever. Call once on startup. Best-effort (swallows errors).
 *
 * Walks a cursor instead of `getAll()`: a crashed multi-GB receive leaves thousands
 * of Blob rows, and `getAll()` would deserialize ALL of them into RAM at once just
 * to read each row's `ts` — the exact memory spike this module exists to avoid. The
 * cursor holds one record at a time, so GC's peak footprint is a single chunk.
 */
export async function gcOrphanStaging(ttlMs = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const d = await openDb();
    const cutoff = Date.now() - ttlMs;
    await new Promise<void>((resolve, reject) => {
      const req = tx(d, "readwrite").openCursor();
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
    /* IDB blocked / unavailable — nothing to prune */
  }
}
