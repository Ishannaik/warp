/**
 * ReceiveSink — the durable-write accumulator for one in-flight incoming file.
 *
 * This is the correctness core of resume (Fable H1). The invariant is:
 *
 *   `bytesWritten` reflects bytes that are DURABLY written, counted only AFTER
 *   each underlying write() resolves — never at enqueue time.
 *
 * The old engine did `item.transferred += buf.byteLength` the instant a chunk
 * arrived, while the disk write was merely queued behind a `.catch(()=>{})` that
 * SWALLOWED failures. With resume that is a silent-corruption engine: a rejected
 * write (disk full, quota, revoked permission) would be eaten, the offset would
 * keep advancing, and a later resume would tell the sender to skip bytes that were
 * never on disk — punching a hole in the file that still closes as "done".
 *
 * So: a write rejection POISONS the sink (`failed = true`); a poisoned sink stops
 * advancing `bytesWritten` and refuses to resume. The hook reads `failed` and
 * surfaces an honest error instead of committing a corrupt file.
 *
 * Two modes:
 *   - memorySink(): accumulate ArrayBuffers, finalize to a Blob (small files).
 *   - diskSink(open): stream straight to a File System Access writable (large
 *     files). The writable is opened lazily as the head of the write chain so
 *     every append is ordered behind it; bytesWritten is incremented inside the
 *     chain after each write resolves.
 */

import type { FsWritable } from "./peer";

export interface ReceiveSink {
  /** Durably-written byte count (post-resolve). The resume offset the receiver reports. */
  readonly bytesWritten: number;
  /** True once any write (or the writable-open) has failed. A poisoned sink must not resume. */
  readonly failed: boolean;
  /** Enqueue a chunk. Updates bytesWritten only after the underlying write resolves. */
  append(buf: ArrayBuffer): void;
  /** Resolve when every queued write has settled (so a reported offset is durable). */
  quiesce(): Promise<void>;
  /** memory: build + return the Blob. disk: close the writable + return null. */
  finalize(): Promise<Blob | null>;
  /** Discard the partial (cancel): drop buffers / abort the writable. */
  abort(): Promise<void>;
}

/** In-memory accumulator. bytesWritten is exact immediately (no async write). */
export function memorySink(mime?: string): ReceiveSink {
  const chunks: ArrayBuffer[] = [];
  let bytes = 0;
  return {
    get bytesWritten() {
      return bytes;
    },
    get failed() {
      return false;
    },
    append(buf) {
      chunks.push(buf);
      bytes += buf.byteLength;
    },
    async quiesce() {
      /* memory writes are synchronous */
    },
    async finalize() {
      return new Blob(chunks, mime ? { type: mime } : undefined);
    },
    async abort() {
      chunks.length = 0;
    },
  };
}

/**
 * Straight-to-disk sink. `open` is called once, lazily, as the head of the write
 * chain — every append() chains behind it so writes land in order, and
 * bytesWritten only advances after each write() resolves.
 */
export function diskSink(open: () => Promise<FsWritable>): ReceiveSink {
  let bytes = 0;
  let failed = false;
  let writable: FsWritable | undefined;

  // Head of the chain opens the writable. A failed open poisons (no re-throw, so
  // there's never an unhandled rejection before the first append attaches).
  let chain: Promise<void> = (async () => {
    writable = await open();
  })().catch(() => {
    failed = true;
  });

  return {
    get bytesWritten() {
      return bytes;
    },
    get failed() {
      return failed;
    },
    append(buf) {
      chain = chain
        .then(async () => {
          if (failed || !writable) return;
          await writable.write(buf);
          bytes += buf.byteLength; // durable: only after the write resolves
        })
        .catch(() => {
          failed = true; // poison — the hook reads `failed` and refuses resume
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
      if (!failed && writable) await writable.close();
      return null;
    },
    async abort() {
      try {
        await chain;
      } catch {
        /* ignore */
      }
      try {
        await (writable?.abort ? writable.abort() : writable?.close());
      } catch {
        /* already gone */
      }
    },
  };
}
