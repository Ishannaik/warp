/**
 * Wire protocol for file transfer over an RTCDataChannel.
 *
 * The channel carries two kinds of frames:
 *   - JSON control frames (strings): file offers, end markers, acks.
 *   - Binary chunks (ArrayBuffer): the raw bytes of the file currently in flight.
 *
 * Because a reliable+ordered DataChannel preserves order, the sender can
 * interleave a `file-offer` control frame, then a run of binary chunks, then a
 * `file-end` frame, and the receiver knows every binary frame between an offer
 * and its end belongs to that file. Only one file is ever in flight at a time.
 */

/** 16 KiB chunk size — the SCTP-friendly sweet spot used across the design copy. */
export const CHUNK_SIZE = 16 * 1024;

/**
 * bufferedAmount high-water mark. When the channel's send buffer exceeds this
 * we stop pumping and wait for `bufferedamountlow` before resuming, so we never
 * balloon memory on a fast disk / slow link.
 */
export const HIGH_WATER_MARK = 8 * 1024 * 1024; // 8 MiB
export const LOW_WATER_MARK = 1 * 1024 * 1024; // 1 MiB

/** Control frames (JSON strings) sent over the data channel. */
export type ControlMessage =
  /** Sent once before a multi-file send so the receiver can pick a strategy
   *  (one directory prompt / one zip) instead of prompting per file. */
  | { t: "batch-start"; count: number; totalSize: number }
  | { t: "file-offer"; id: string; name: string; size: number; mime: string }
  | { t: "file-end"; id: string }
  | { t: "file-ack"; id: string }
  /** Sent after the last file of a batch, before `all-done`. */
  | { t: "batch-end" }
  | { t: "all-done" };

/** Direction of a transfer relative to this peer. */
export type Direction = "send" | "receive";

/** Lifecycle status of a single file transfer. */
export type TransferStatus = "queued" | "active" | "done" | "error";

/** A single file's transfer state, surfaced to the UI. */
export interface TransferItem {
  id: string;
  name: string;
  size: number;
  mime: string;
  direction: Direction;
  status: TransferStatus;
  /** Bytes transferred so far. */
  transferred: number;
  /** 0..100, derived. */
  progress: number;
}

/** Human-readable byte formatter matching the design's `fmt()`. */
export function formatBytes(b: number): string {
  if (b >= 1e9) return (b / 1e9).toFixed(1) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(b >= 1e8 ? 0 : 1) + " MB";
  if (b >= 1e3) return (b / 1e3).toFixed(0) + " KB";
  return b + " B";
}

/** Crockford-ish room code: WRAP-XXXX-XX. */
export function generateCode(): string {
  const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const pick = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `WRAP-${pick(4)}-${pick(2)}`;
}

/** Stable id for a file in the queue. */
export function fileId(): string {
  return Math.random().toString(36).slice(2, 10);
}
