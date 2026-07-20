/**
 * Main-thread wrapper around the SHA-256 Web Worker (`hashWorker.ts`).
 *
 * A `HashSession` is per-file scratchpad state: `update(block)` posts each 4 MiB
 * read block (send) or incoming chunk (receive) into the worker, and
 * `finalize()` returns the hex digest once every queued block has been consumed.
 *
 * Two facts drive the shape of this module:
 *
 *  1. `crypto.subtle.digest` isn't streaming — you'd have to hold the whole
 *     file in memory to use it. We can't. `sha256.ts` (used by the worker)
 *     replaces it.
 *  2. Even an incremental JS/WASM hash on the main thread would fight the
 *     transfer loop and the UI. We push all CPU into a dedicated worker so
 *     hashing overlaps with the network path instead of blocking it.
 *
 * A single worker instance is shared across sessions (send + receive can hash
 * concurrently), lazily created on the first `createHashSession()` call so a
 * transfer that never uses hashing pays nothing. Sessions are keyed by an
 * opaque id so the worker's `finalize` reply routes back to the right caller.
 *
 * Buffer ownership: `update()` deliberately does NOT transfer — the caller
 * (the send pump, the receive sink) still needs the buffer. postMessage
 * without a transfer list structured-clones synchronously, so the worker gets
 * its own copy and the caller's buffer stays intact.
 */

export interface HashSession {
  /** Feed a block. Buffer is copied into the worker; the caller keeps ownership. */
  update(block: ArrayBuffer | Uint8Array): void;
  /** Resolves with the hex digest of every block fed so far. Idempotent-safe:
   *  further update()/finalize()/dispose() calls become no-ops. */
  finalize(): Promise<string>;
  /** Drop the session without waiting for a digest (cancel path). */
  dispose(): void;
}

let worker: Worker | null = null;
let workerUnavailable = false;
let nextId = 0;
const pending = new Map<string, (digest: string) => void>();

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (workerUnavailable) return null;
  try {
    worker = new Worker(new URL("./hashWorker.ts", import.meta.url), { type: "module" });
    worker.addEventListener("message", (ev: MessageEvent<{ id: string; digest: string }>) => {
      const { id, digest } = ev.data;
      const resolve = pending.get(id);
      if (resolve) {
        pending.delete(id);
        resolve(digest);
      }
    });
    return worker;
  } catch {
    // Environments without Worker support (SSR probes, the engine check harness
    // that runs peer.ts under Node) skip hashing rather than break the transfer
    // pipeline. When #6 lands the manifest-verify UI, it will separately gate
    // on whether a digest was emitted for the file.
    workerUnavailable = true;
    return null;
  }
}

/** No-op session: hashing is unavailable, so update/finalize/dispose are inert
 *  and finalize resolves with an empty digest. */
const noopSession: HashSession = {
  update() {},
  finalize: async () => "",
  dispose() {},
};

export function createHashSession(): HashSession {
  const w = ensureWorker();
  if (!w) return noopSession;
  const id = `h${++nextId}`;
  w.postMessage({ cmd: "init", id });
  let closed = false;
  return {
    update(block) {
      if (closed) return;
      // Normalize to ArrayBuffer for postMessage. A Uint8Array view carries its
      // parent buffer's full extent under structuredClone, so slice a right-
      // sized copy when we're handed a view.
      const buf =
        block instanceof ArrayBuffer
          ? block
          : block.buffer.slice(block.byteOffset, block.byteOffset + block.byteLength);
      w.postMessage({ cmd: "update", id, block: buf });
    },
    finalize() {
      return new Promise<string>((resolve) => {
        if (closed) {
          resolve("");
          return;
        }
        closed = true;
        pending.set(id, resolve);
        w.postMessage({ cmd: "finalize", id });
      });
    },
    dispose() {
      if (closed) return;
      closed = true;
      pending.delete(id);
      w.postMessage({ cmd: "dispose", id });
    },
  };
}
