/**
 * Wire protocol for file transfer over an RTCDataChannel.
 *
 * The channel carries two kinds of frames:
 *   - JSON control frames (strings): batch offers, accept/decline gating,
 *     begin/end markers, cancels, and inline text snippets.
 *   - Binary chunks (ArrayBuffer): the raw bytes of the file currently in flight.
 *
 * Because a reliable+ordered DataChannel preserves order, the sender can
 * interleave a `file-begin` control frame, then a run of binary chunks, then a
 * `file-end` frame, and the receiver knows every binary frame between a begin
 * and its end belongs to that file. Only one file is ever in flight at a time.
 *
 * New in the review-before-receive redesign: the sender first announces a whole
 * batch manifest (`offer`) and waits for the receiver's `accept`/`decline`. No
 * bytes flow until the receiver explicitly accepts. The channel stays OPEN after
 * a batch so either peer can offer again without re-pairing.
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

/** A single file's descriptor inside a batch manifest. */
export interface OfferItem {
  id: string;
  name: string;
  size: number;
  mime: string;
  /** Small data-URL preview (image files only, best-effort). Omitted otherwise. */
  thumb?: string;
}

/** Control frames (JSON strings) sent over the data channel. */
export type ControlMessage =
  /** Sender announces a batch manifest; receiver must accept before any bytes flow. */
  | { t: "offer"; batchId: string; items: OfferItem[] }
  /** Receiver accepts a batch -> sender starts streaming. */
  | { t: "accept"; batchId: string }
  /** Receiver declines a batch -> sender sends nothing, marks the batch declined. */
  | { t: "decline"; batchId: string }
  /** Sent immediately before a file's binary chunks. */
  | { t: "file-begin"; id: string }
  /** Sent immediately after a file's binary chunks. */
  | { t: "file-end"; id: string }
  /** Either side cancels a file in flight (sender stops; receiver discards partial). */
  | { t: "cancel"; id: string }
  /** A text snippet — shown directly in the other side's tray (no accept needed). */
  | { t: "text"; id: string; text: string };

/** Direction of a transfer relative to this peer. */
export type Direction = "send" | "receive";

/** Kind of tray item. */
export type ItemKind = "file" | "text";

/** Lifecycle status of a single tray item. */
export type TransferStatus =
  | "offered" // announced, awaiting accept (send) / awaiting bytes (receive)
  | "transferring" // bytes in flight
  | "done" // fully transferred
  | "declined" // the receiver declined the batch
  | "cancelled" // cancelled mid-flight by either side
  | "error";

/**
 * A single tray item's state, surfaced to the UI. Covers both files and text,
 * both directions. For a received file, `blob` holds the bytes in memory until
 * the user downloads it (the UI never auto-saves).
 */
export interface TransferItem {
  id: string;
  batchId: string;
  name: string;
  size: number;
  mime: string;
  kind: ItemKind;
  direction: Direction;
  status: TransferStatus;
  /** Bytes transferred so far. */
  transferred: number;
  /** 0..100, derived. */
  progress: number;
  /** Small image data-URL preview, when available. */
  thumb?: string;
  /** Text payload for `kind:"text"` items. */
  text?: string;
  /** Received file bytes, held in memory until the user downloads. */
  blob?: Blob;
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

/** Stable id for a file or batch. */
export function fileId(): string {
  return Math.random().toString(36).slice(2, 10);
}
