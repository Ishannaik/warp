/**
 * Origin Private File System (OPFS) sink for receiving large files on browsers
 * WITHOUT the File System Access API — iOS Safari (15.2+) and Firefox (111+).
 * This is the PRIMARY large-receive fallback; `idbStage.ts` (IndexedDB Blob
 * staging) is now the LAST resort for the rare stack without OPFS sync access.
 *
 * Why OPFS over IndexedDB (research-2026-07.md §4, P1):
 *   - `idbSink` stages chunks as Blob rows and then assembles a Blob-of-Blobs in
 *     `finalize()`. That final assembly is the in-RAM step that pressures the iOS
 *     jetsam ceiling (~1.5 GB, uncatchable kill) the IDB path exists to avoid.
 *   - OPFS streams and seeks in place: a `FileSystemSyncAccessHandle` writes each
 *     chunk straight to a bucket file and `flush()`es it durable, so nothing is
 *     ever materialized as one big in-RAM Blob. `finalize()` returns a file-backed
 *     `File` (a lazy snapshot of the OPFS file), not a RAM copy.
 *   - The sync access handle is Worker-only (`[Exposed=DedicatedWorker]`), so the
 *     write loop lives in a small dedicated worker; the main thread just hands it
 *     ArrayBuffers and tracks the durable byte count.
 *
 * Correctness invariants (mirror receiveController/idbStage — Fable H1):
 *   - `bytesWritten` advances ONLY after the worker acks a flushed write (durable).
 *   - Any write/open/close failure POISONS the sink (`failed = true`); a poisoned
 *     sink stops advancing and the hook surfaces an honest error instead of
 *     committing a corrupt file.
 *
 * OPFS still counts against the origin quota and is best-effort evictable, so the
 * accept path still gates on `storageFits()` (idbStage) before choosing this sink.
 * The iOS *memory* cap in `estimateFits()` does NOT apply here — there is no in-RAM
 * assembly — so OPFS lets iOS receive larger files than the IDB path honestly could.
 */

import type { ReceiveSink } from "./receiveController";

/** Every staging file is named with this prefix so GC can find and prune orphans. */
const STAGE_PREFIX = "warp-stage-";

/**
 * Minimal OPFS surface we touch. `lib.dom` here doesn't model the Worker-only sync
 * access handle, so we declare just what the sink needs (structurally compatible
 * with the real API).
 */
interface OpfsSyncAccessHandle {
  write(buf: ArrayBuffer): number;
  flush(): void;
  close(): void;
}
interface OpfsFileHandle {
  getFile(): Promise<File>;
  createSyncAccessHandle(): Promise<OpfsSyncAccessHandle>;
}
interface OpfsDirEntry {
  kind: string;
  name: string;
  getFile?: () => Promise<File>;
}
interface OpfsDirHandle {
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<OpfsFileHandle>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterable<OpfsDirEntry>;
}
interface NavigatorWithOpfs {
  storage?: { getDirectory?: () => Promise<OpfsDirHandle> };
}

/**
 * The durable-write seam the sink talks to. The real implementation
 * (`workerWriter`) drives a Worker holding the sync access handle; the check
 * harness injects a fake to exercise the accounting/poison logic in Node.
 */
export interface OpfsWriter {
  /** Append bytes at the current end; resolve once they are durably flushed. */
  write(buf: ArrayBuffer): Promise<void>;
  /** Flush + close the underlying handle (no more writes after this). */
  close(): Promise<void>;
  /** Return the staged bytes as a file-backed Blob (call AFTER close()). */
  toBlob(mime?: string): Promise<Blob>;
  /** Delete the staging file (abort / cleanup). Best-effort. */
  remove(): Promise<void>;
}

/**
 * Capability gate for the OPFS path. The sync access handle itself is Worker-only
 * and can't be probed synchronously, so we gate on its two prerequisites: the OPFS
 * bucket entry point (`navigator.storage.getDirectory`) and `Worker`. On the rare
 * stack that has getDirectory but not the sync handle, the sink's open rejects and
 * the accept path's fallback/error handling keeps the transfer honest.
 */
export function opfsSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as unknown as NavigatorWithOpfs;
  if (typeof nav.storage?.getDirectory !== "function") return false;
  if (typeof Worker === "undefined") return false;
  return true;
}

/**
 * The worker body, inlined as a Blob URL so this module stays bundlable by the
 * dependency-free check harness (a separate `?worker` import would break esbuild's
 * neutral bundle). The worker holds the sync access handle and services open /
 * write / close, reporting durable completion (or error) back per request.
 */
const OPFS_WORKER_SRC = `
let handle = null;
self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.t === "open") {
      navigator.storage.getDirectory()
        .then((root) => root.getFileHandle(m.name, { create: true }))
        .then((fh) => fh.createSyncAccessHandle())
        .then((h) => { handle = h; self.postMessage({ t: "opened" }); })
        .catch((err) => self.postMessage({ t: "error", message: String((err && err.message) || err) }));
    } else if (m.t === "write") {
      handle.write(m.buf);
      handle.flush();
      self.postMessage({ t: "wrote" });
    } else if (m.t === "close") {
      if (handle) { handle.flush(); handle.close(); handle = null; }
      self.postMessage({ t: "closed" });
    }
  } catch (err) {
    self.postMessage({ t: "error", message: String((err && err.message) || err) });
  }
};
`;

let workerUrl: string | null = null;
function opfsWorkerUrl(): string {
  if (!workerUrl) {
    workerUrl = URL.createObjectURL(new Blob([OPFS_WORKER_SRC], { type: "application/javascript" }));
  }
  return workerUrl;
}

async function opfsRoot(): Promise<OpfsDirHandle> {
  const nav = navigator as unknown as NavigatorWithOpfs;
  const getDir = nav.storage?.getDirectory;
  if (typeof getDir !== "function") throw new Error("OPFS unavailable");
  return getDir.call(nav.storage);
}

/**
 * The production OpfsWriter: a DedicatedWorker holds the sync access handle for
 * synchronous, durable, RAM-free writes; `toBlob`/`remove` use the main-thread
 * async OPFS API (valid once the handle is closed). Requests are chained one at a
 * time by the sink, so a single outstanding-reply slot is enough.
 */
function workerWriter(name: string): OpfsWriter {
  const worker = new Worker(opfsWorkerUrl(), { name: "warp-opfs" });
  let pending: { resolve: () => void; reject: (e: Error) => void } | null = null;
  let dead = false;
  let didOpen = false;
  let openP: Promise<void> | null = null;

  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { t: string; message?: string };
    if (m.t === "error") {
      dead = true;
      pending?.reject(new Error(m.message || "OPFS worker error"));
      pending = null;
      return;
    }
    if (m.t === "opened") didOpen = true;
    pending?.resolve();
    pending = null;
  };
  worker.onerror = (e: ErrorEvent) => {
    dead = true;
    pending?.reject(new Error(e.message || "OPFS worker crashed"));
    pending = null;
  };

  const rpc = (msg: unknown, transfer?: Transferable[]): Promise<void> =>
    new Promise((resolve, reject) => {
      if (dead) {
        reject(new Error("OPFS worker unavailable"));
        return;
      }
      pending = { resolve, reject };
      worker.postMessage(msg, transfer ?? []);
    });

  const open = (): Promise<void> => (openP ??= rpc({ t: "open", name }));

  return {
    async write(buf) {
      await open();
      await rpc({ t: "write", buf }, [buf]); // transfer: zero-copy into the worker
    },
    async close() {
      if (!didOpen && !openP) {
        worker.terminate(); // never opened -> nothing to flush
        return;
      }
      try {
        await open();
        await rpc({ t: "close" });
      } finally {
        worker.terminate();
      }
    },
    async toBlob(mime) {
      const root = await opfsRoot();
      const fh = await root.getFileHandle(name);
      const file = await fh.getFile();
      return mime ? new Blob([file], { type: mime }) : file;
    },
    async remove() {
      try {
        const root = await opfsRoot();
        await root.removeEntry(name);
      } catch {
        /* already gone */
      }
    },
  };
}

/**
 * A ReceiveSink backed by an OPFS bucket file. `bytesWritten` advances only after
 * the worker acks a flushed (durable) write; any failure poisons the sink. The
 * `makeWriter` seam defaults to the Worker-backed writer and is injectable for the
 * check harness.
 */
export function opfsSink(
  fileId: string,
  mime?: string,
  makeWriter: (name: string) => OpfsWriter = workerWriter,
): ReceiveSink {
  const name = STAGE_PREFIX + fileId;
  const writer = makeWriter(name);
  let bytes = 0;
  let failed = false;
  let chain: Promise<void> = Promise.resolve();

  const empty = () => new Blob([], mime ? { type: mime } : undefined);

  return {
    get bytesWritten() {
      return bytes;
    },
    get failed() {
      return failed;
    },
    append(buf) {
      const len = buf.byteLength;
      chain = chain.then(async () => {
        if (failed) return;
        try {
          await writer.write(buf);
          bytes += len; // durable: only after the flushed write is acked
        } catch {
          failed = true; // poison — never a silent hole
        }
      });
    },
    async quiesce() {
      try {
        await chain;
      } catch {
        /* poison flag already set */
      }
    },
    async finalize() {
      await this.quiesce();
      if (failed) {
        void writer.remove();
        return empty();
      }
      try {
        await writer.close();
        // File-backed snapshot of the OPFS file (no RAM copy). The staging file
        // is left in place so this Blob stays valid until download; gcOrphanOpfs()
        // prunes it on a TTL. (Removing it here could invalidate the handed-out Blob.)
        return await writer.toBlob(mime);
      } catch {
        failed = true;
        void writer.remove();
        return empty();
      }
    },
    async abort() {
      try {
        await chain;
      } catch {
        /* ignore */
      }
      try {
        await writer.close();
      } catch {
        /* ignore */
      }
      try {
        await writer.remove();
      } catch {
        /* already gone */
      }
    },
  };
}

/**
 * Prune OPFS staging files older than a TTL (crashed / abandoned sessions) so the
 * bucket doesn't leak quota forever. Call once on startup, alongside
 * `gcOrphanStaging()`. Best-effort (swallows every error). A completed transfer's
 * file-backed tray Blob keeps its OPFS file alive within a session; this only reaps
 * files stale enough that no live tray still references them.
 */
export async function gcOrphanOpfs(ttlMs = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    if (!opfsSupported()) return;
    const root = await opfsRoot();
    const cutoff = Date.now() - ttlMs;
    for await (const entry of root.values()) {
      if (entry.kind !== "file" || !entry.name.startsWith(STAGE_PREFIX)) continue;
      try {
        const file = await entry.getFile?.();
        if (file && file.lastModified < cutoff) await root.removeEntry(entry.name);
      } catch {
        /* skip this entry */
      }
    }
  } catch {
    /* OPFS unavailable — nothing to prune */
  }
}
