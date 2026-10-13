/**
 * The receive-side resume decisions: when a re-offer may auto-resume, at what
 * offsets, how a reload rebuilds the registry from the durable ledger, and which
 * sink kind a ledger row records.
 *
 * Extracted from useWarpTransfer (no React import) so `useWarpTransfer.check.mjs`
 * exercises the real decisions rather than hand-mirrored copies that stay green
 * when the hook regresses (#341). The hook keeps the React state, refs, storage
 * calls and sink construction; everything that decides lives here.
 */

import type { AcceptTarget } from "./peer";
import type { ReceiveSink } from "./receiveController";
import type { LedgerSinkKind, RxLedgerRow } from "./rxLedger";
import type { OfferItem } from "./transfer";

/**
 * One in-flight (or paused) incoming file's durable state, owned by the HOOK
 * (not the peer) so it SURVIVES a peer rebuild on reconnect — the key to resume.
 * Keyed by the file's stable `key`. `sink.bytesWritten` is the resume offset.
 */
export interface RxEntry {
  key: string;
  size: number;
  /** The sender's token; a re-offer must present the same one to auto-resume (H5). */
  resumeToken: string;
  sink: ReceiveSink;
  /** Disk target for this file (absent = in-memory). */
  target?: AcceptTarget;
  /** True while a peer is actively receiving into it. A drop sets it false. */
  active: boolean;
  /** Which peer currently owns writes (H4): a chunk from a non-owner is dropped. */
  ownerToken?: string;
  /** On-disk name chosen (disk mode). */
  savedName?: string;
  /**
   * Durable coordinates for reload-resume (issue #36), present only for the
   * origin-storage sinks whose staged bytes SURVIVE a tab reload (IDB today; OPFS
   * recorded for forward-compat). `fileId` is the staging name the sink used, so a
   * reload reconstructs the SAME sink over the SAME bytes; the ledger row this
   * feeds is written on durable progress and read back at mount to repopulate the
   * registry. Absent for memory / disk sinks (they can't reload-resume here).
   */
  ledger?: { fileId: string; sinkKind: LedgerSinkKind; mime: string; name: string };
}

/**
 * Decide whether an inbound offer auto-resumes (Fable H3/H5/M1/M2): true only if
 * EVERY item is a known in-progress file — its key is in the registry, not active,
 * token matches, not cancelled, not paused, AND its sink is healthy. Duplicate keys
 * in one batch disable resume (force the modal). A POISONED sink (a failed write)
 * also forces the modal: silently auto-resuming onto a sink that can no longer
 * accept bytes would just stream the whole tail into nowhere and die at file-end.
 */
export function isAutoResumable(
  items: OfferItem[],
  reg: Map<string, RxEntry>,
  cancelledKeys: Set<string>,
  pausedKeys: Set<string>,
): boolean {
  const keys = items.map((i) => i.key);
  const dupKeys = new Set(keys).size !== keys.length;
  return (
    !dupKeys &&
    items.length > 0 &&
    items.every((it) => {
      const e = it.key ? reg.get(it.key) : undefined;
      return (
        !!e &&
        !e.active &&
        !e.sink.failed &&
        !!it.resumeToken &&
        e.resumeToken === it.resumeToken &&
        !cancelledKeys.has(it.key!) &&
        !pausedKeys.has(it.key!)
      );
    })
  );
}

/**
 * The auto-resume accept's arguments: each file's DURABLE byte count as its offset
 * (H1, read after the sink quiesces) and the first entry's disk target. Only call
 * this once `isAutoResumable` has said yes — every item's key must be registered.
 */
export async function collectResumeOffsets(
  items: OfferItem[],
  reg: Map<string, RxEntry>,
): Promise<{ resume: Record<string, number>; target: AcceptTarget | undefined }> {
  const resume: Record<string, number> = {};
  let target: AcceptTarget | undefined;
  for (const it of items) {
    const e = reg.get(it.key!)!;
    await e.sink.quiesce();
    resume[it.id] = e.sink.bytesWritten;
    if (!target) target = e.target;
  }
  return { resume, target };
}

/** What reload-resume does with one ledger row. */
export type LedgerPlan =
  | { action: "skip" } // leave the row alone (unknown kind, or a live entry owns the file)
  | { action: "drop" } // remove the row: corrupt, complete, or its durable prefix can't be proven
  | { action: "resume"; offset: number }; // rebuild the entry at this reconciled offset

/** How to measure what is REALLY staged now (injected so this module stays storage-free). */
export interface DurableLengths {
  /** IDB: the contiguous staged prefix length (`idbDurableLength`). */
  idbLength: (fileId: string) => Promise<number>;
  /** OPFS: the file's real length, or undefined if unreadable (`opfsDurableLength`). */
  opfsLength: (fileId: string) => Promise<number | undefined>;
}

/**
 * Reload-resume (#36): decide how one durable-ledger row rebuilds its registry entry.
 *
 * Both durable kinds reconcile the ledger offset against what is REALLY staged now
 * and resume at `min(real, ledger)` — never the ledger alone (H1). The ledger's
 * `bytesWritten` was durable when written, but it can outlive the staged bytes:
 * OPFS flushes are BATCHED, so after an unclean close the file's real length can lag
 * the ledger (#169); and the IDB staging rows and the ledger row live in separate
 * databases with independent TTL GCs (gcOrphanStaging vs gcRxLedger), so a prefix
 * row can be reaped while a fresher ledger row survives. If the durable length can't
 * be read (OPFS file gone / unavailable) the row is dropped; if it measures 0 we
 * resume at 0 (an honest full re-receive through the auto-resume path).
 */
export async function reconcileLedgerRow(
  row: RxLedgerRow,
  hasLiveEntry: boolean,
  lengths: DurableLengths,
): Promise<LedgerPlan> {
  if (row.sinkKind !== "idb" && row.sinkKind !== "opfs") return { action: "skip" }; // others: honest restart
  // Trust the offset only if it's a sane, incomplete count — a corrupt or
  // already-complete row is dropped, never resumed (H1/H2).
  if (!Number.isInteger(row.bytesWritten) || row.bytesWritten < 0 || row.bytesWritten >= row.size) {
    return { action: "drop" };
  }
  if (hasLiveEntry) return { action: "skip" }; // a live entry already owns this file

  let real: number;
  if (row.sinkKind === "idb") {
    real = await lengths.idbLength(row.fileId);
  } else {
    // A length we can't read means we can't prove where the durable prefix ends, so
    // drop the row and let the sender's re-offer show the accept modal (honest
    // restart) rather than resume onto a hole.
    const opfs = await lengths.opfsLength(row.fileId);
    if (opfs === undefined) return { action: "drop" };
    real = opfs;
  }
  const offset = Math.min(real, row.bytesWritten);
  if (!Number.isInteger(offset) || offset < 0 || offset >= row.size) return { action: "drop" };
  return { action: "resume", offset };
}

/**
 * Keep a ledger row's sinkKind in step with the sink that ACTUALLY holds the bytes:
 * an OPFS receive that fell back to IDB (#170) reports activeKind "idb", so a reload
 * reconstructs an idbSink over the IDB rows rather than probing an OPFS file that
 * was never written. Syncs `ledger` in place and returns the kind to persist.
 */
export function syncLedgerSinkKind(
  ledger: { sinkKind: LedgerSinkKind },
  sink: ReceiveSink,
): LedgerSinkKind {
  const liveKind = (sink as { activeKind?: LedgerSinkKind }).activeKind;
  if (liveKind) ledger.sinkKind = liveKind;
  return ledger.sinkKind;
}
