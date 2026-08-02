/**
 * Per-piece SHA-256 manifest + streaming verifier (issue #137, research-2026-07
 * §3/§6/P5).
 *
 * Warp already resumes an interrupted receive at a byte OFFSET (#36/#169): the
 * receiver reports its durable `bytesWritten` and the sender streams from there.
 * But that model TRUSTS everything before the offset — a half-written or corrupt
 * prefix is taken on faith, and a single bad byte forces a coarse full resend
 * rather than a targeted fix. The research is explicit that the sturdier
 * foundation is a per-piece hash manifest (BEP 52's "piece layers", Hypercore's
 * tree proofs, the tus Checksum extension): the receiver verifies each piece as
 * it lands, localizes any corruption to one index, and re-requests ONLY that
 * piece.
 *
 * Threat model (kept honest per research §3): the data channel is a reliable,
 * ordered, DTLS-authenticated SCTP stream, so in-transit bit flips are already
 * impossible. Per-piece hashing therefore targets STORAGE / implementation
 * corruption and VERIFIED resume — not an adversarial wire. A mismatch means the
 * bytes the receiver holds are wrong, and the fix is to re-fetch that one piece.
 *
 * This module is the dependency-free core of that mechanism:
 *   - `manifestFromBytes` / `manifestFromFile` compute one SHA-256 hex per piece
 *     (the sender sends this before the file's bytes — see transfer.ts/peer.ts).
 *   - `PieceVerifier` is the receive-side streaming checker: it ingests plaintext
 *     in wire order, cuts it at piece boundaries, verifies each complete piece,
 *     emits only the VERIFIED pieces to append to the sink, and halts with a
 *     `mismatch` index the caller re-requests. `verifiedBytes` is the highest
 *     contiguous VERIFIED offset (P5) — never ahead of a piece that failed its
 *     hash, so a resume built on it can never trust a corrupt prefix.
 *
 * It builds on the inlined FIPS 180-4 `sha256.ts` (not `crypto.subtle`, which has
 * no streaming API and isn't in the Node check harness) so the exact same code
 * runs in the browser and under `node src/lib/warp/pieceManifest.check.mjs`.
 *
 * Piece size: 256 KiB, matching `TARGET_SEND_CHUNK` in peer.ts. The issue sketches
 * 16 KiB (the design-copy `CHUNK_SIZE`), but the wire actually ships ~256 KiB
 * SCTP messages, and the research (§3) recommends 256 KiB–1 MiB pieces aligned to
 * the send chunk. 256 KiB keeps the manifest compact (a 1 GiB file is 4096 hashes,
 * ~256 KiB of hex, not 65536) and maps one-to-one onto the dominant wire message,
 * which is the issue's stated intent ("maps directly onto what's already on the
 * wire"). The verifier is piece-size-agnostic regardless — it reads `pieceSize`
 * from the manifest the sender supplies.
 */

import { init, update, finalize, toHex } from "./sha256";

/** Preferred piece size (bytes) and the floor `choosePieceSize` never goes under.
 *  Aligned to TARGET_SEND_CHUNK (see header). */
export const PIECE_SIZE = 256 * 1024;

/**
 * Hard cap on the number of pieces (hence hashes) in a manifest. The manifest
 * rides inside the `file-begin` control frame — ONE data-channel message — which
 * must stay under the negotiated `maxMessageSize` (RFC 8841 §6.1 default 64 KiB;
 * Warp negotiates up to 256 KiB). Each hash is 64 hex chars + JSON punctuation
 * (~67 bytes), so 512 hashes ≈ 34 KB — comfortably under even the 64 KiB default,
 * on every stack. `choosePieceSize` grows the piece size to keep the count at or
 * below this, so the manifest frame is bounded for ANY file size (this is the
 * research §3 "piece size scales with file size" rule, libtorrent-style).
 */
export const MAX_PIECES = 512;

/**
 * Pick the piece size for a file of `size` bytes: the 256 KiB floor, doubled until
 * the piece count fits MAX_PIECES. Keeps the manifest frame small for huge files
 * (a 2 GiB file gets 4 MiB pieces → 512 hashes) while staying wire-aligned for the
 * common small/medium case. The receiver reads the chosen size back from the
 * manifest, so this is transparent to it.
 */
export function choosePieceSize(size: number): number {
  let ps = PIECE_SIZE;
  while (pieceCount(size, ps) > MAX_PIECES) ps *= 2;
  return ps;
}

/**
 * Below this many bytes a file gets NO manifest: the per-piece hashing overhead
 * (an extra read pass at offer time, plus the manifest frame) isn't worth it for
 * small files, and a corrupt tiny file is cheap to resend whole (issue #137:
 * "skip the overhead for tiny files").
 */
export const MANIFEST_MIN_BYTES = 1 * 1024 * 1024;

/**
 * Above this many bytes a file ALSO gets no manifest in v1: the manifest is
 * computed by reading the whole file once at offer time, and hashing a multi-GB
 * file up front would wreck time-to-first-byte. Such files keep the proven
 * byte-offset resume (#36/#169). Lifting this (an incremental manifest hashed
 * during the send pump) is a documented follow-up, not this increment.
 */
export const MANIFEST_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Does a file of `size` bytes warrant a piece manifest? */
export function shouldManifest(size: number): boolean {
  return size >= MANIFEST_MIN_BYTES && size <= MANIFEST_MAX_BYTES;
}

/** One file's piece-hash manifest, sent before its bytes. */
export interface PieceManifest {
  /** Piece size in bytes (the last piece may be shorter). */
  pieceSize: number;
  /** Total plaintext file size in bytes. */
  size: number;
  /** One lower-case SHA-256 hex digest per piece, in piece order. */
  hashes: string[];
}

function toU8(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

/** SHA-256 hex digest of one piece's bytes. */
export function hashPiece(buf: ArrayBuffer | Uint8Array): string {
  const s = init();
  update(s, toU8(buf));
  return toHex(finalize(s));
}

/** Constant-time-ish equality of a piece against its expected hex digest. */
export function verifyPiece(buf: ArrayBuffer | Uint8Array, expectedHex: string): boolean {
  return hashPiece(buf) === expectedHex.toLowerCase();
}

/** Number of pieces covering `size` bytes at `pieceSize` (0 for an empty file). */
export function pieceCount(size: number, pieceSize: number): number {
  return size <= 0 ? 0 : Math.ceil(size / pieceSize);
}

/** Byte length of piece `index` (the last piece may be shorter than pieceSize). */
export function pieceLength(size: number, pieceSize: number, index: number): number {
  const start = index * pieceSize;
  if (start >= size) return 0;
  return Math.min(pieceSize, size - start);
}

/**
 * Compute a manifest from an in-memory buffer. Used by the check harness and for
 * small in-memory sends; the browser send path uses `manifestFromFile` to avoid
 * holding a large file in RAM.
 */
export function manifestFromBytes(bytes: Uint8Array, pieceSize = PIECE_SIZE): PieceManifest {
  const hashes: string[] = [];
  for (let off = 0; off < bytes.byteLength; off += pieceSize) {
    hashes.push(hashPiece(bytes.subarray(off, Math.min(off + pieceSize, bytes.byteLength))));
  }
  return { pieceSize, size: bytes.byteLength, hashes };
}

/**
 * Compute a manifest from a File by reading piece-sized slices, so a large file
 * is never held in RAM whole (mirrors the send pump's sliced reads). One read +
 * one hash per piece; the reads are sequential to keep peak memory at one piece.
 */
export async function manifestFromFile(file: File, pieceSize = PIECE_SIZE): Promise<PieceManifest> {
  const hashes: string[] = [];
  for (let off = 0; off < file.size; off += pieceSize) {
    const buf = await file.slice(off, Math.min(off + pieceSize, file.size)).arrayBuffer();
    hashes.push(hashPiece(buf));
  }
  return { pieceSize, size: file.size, hashes };
}

/** Result of feeding bytes to a `PieceVerifier`. */
export interface VerifyResult {
  /**
   * Complete pieces that passed their hash, in piece order. The caller appends
   * ONLY these to the sink — a piece that failed its hash is never emitted, so
   * the sink never holds an unverified byte (Fable H1, extended to pieces).
   */
  verified: Uint8Array[];
  /**
   * The index of a piece that failed its hash, or null. When non-null the
   * verifier is HALTED: further `push()` calls just buffer bytes until the caller
   * supplies the corrected piece via `injectPiece(mismatch, bytes)`.
   */
  mismatch: number | null;
}

/**
 * Streaming receive-side piece verifier. Feed plaintext bytes in wire order via
 * `push()`; it cuts them at piece boundaries, verifies each complete piece against
 * the manifest, and returns the verified pieces to append to the sink. On a
 * mismatch it halts and reports the bad index; the caller re-requests that one
 * piece and feeds the corrected bytes via `injectPiece()`, after which verification
 * resumes forward (any bytes that arrived ahead of the gap are buffered and
 * verified in order).
 *
 * `verifiedBytes` is the highest contiguous VERIFIED offset (research P5): it
 * advances only when a piece passes its hash, so it never leads a corrupt or
 * missing piece. A resume offset derived from it is a byte that is provably there
 * and correct — the refinement #36/#169's durable-written offset needs.
 */
export class PieceVerifier {
  private readonly manifest: PieceManifest;
  /** Index of the piece currently being assembled / next to verify. */
  private cursor: number;
  /** Bytes buffered toward the next piece(s), not yet verified. */
  private pending: Uint8Array[] = [];
  private pendingLen = 0;
  /** Contiguous verified byte count (P5). Advances only on a passed piece. */
  private verified: number;
  /** Index of the piece that failed its hash, or null when healthy. */
  private stuck: number | null = null;

  /**
   * `startPiece` (#171, research P5) seeds a RESUMED receive: a manifest receive
   * only ever writes WHOLE verified pieces to the sink, so a resumed offset is
   * always a piece boundary, and the caller passes `offset / pieceSize`. `cursor`
   * and `verified` start at that boundary, so the tail verifies piece-by-piece
   * exactly as a fresh receive verifies from 0 — `verifiedBytes` reports from the
   * boundary, `done` fires when the last piece verifies, and a corrupt tail piece
   * halts at its ABSOLUTE index for targeted re-request. A fresh receive passes the
   * default 0 and behaves exactly as before. The caller must only pass a true piece
   * boundary (peer.ts gates on `offset % pieceSize === 0`); a misaligned seed would
   * re-emit pieces the sink already holds, so it is never constructed that way.
   */
  constructor(manifest: PieceManifest, startPiece = 0) {
    this.manifest = manifest;
    this.cursor = startPiece;
    this.verified = startPiece * manifest.pieceSize;
  }

  /** Highest contiguous verified byte offset (the safe resume point, P5). */
  get verifiedBytes(): number {
    return this.verified;
  }

  /** The halted mismatch index, or null when verification is healthy. */
  get mismatch(): number | null {
    return this.stuck;
  }

  /** Bytes buffered but not yet verified (0 once the file is done). */
  get pendingBytes(): number {
    return this.pendingLen;
  }

  /** True once every piece has verified and nothing is buffered. */
  get done(): boolean {
    return this.verified === this.manifest.size && this.pendingLen === 0 && this.stuck === null;
  }

  private lengthOf(index: number): number {
    return pieceLength(this.manifest.size, this.manifest.pieceSize, index);
  }

  /**
   * Feed the next plaintext bytes (wire order). Returns the pieces that verified
   * and, if one failed, its index. While halted on a mismatch this only buffers —
   * call `injectPiece()` with the corrected piece to resume.
   */
  push(chunk: ArrayBuffer | Uint8Array): VerifyResult {
    const u8 = toU8(chunk);
    if (u8.byteLength > 0) {
      this.pending.push(u8);
      this.pendingLen += u8.byteLength;
    }
    return this.drain();
  }

  /**
   * Supply the corrected bytes for the piece the verifier halted on (the sender's
   * targeted re-request answer). Accepted only if `index` is the halted mismatch
   * AND the bytes both match the piece's expected length and pass its hash; then
   * verification resumes forward over any buffered ahead-bytes. A wrong index or a
   * still-bad piece leaves the verifier halted (the caller may retry or give up).
   */
  injectPiece(index: number, bytes: ArrayBuffer | Uint8Array): VerifyResult {
    if (this.stuck === null || index !== this.stuck) return { verified: [], mismatch: this.stuck };
    const u8 = toU8(bytes);
    if (u8.byteLength !== this.lengthOf(index) || hashPiece(u8) !== this.manifest.hashes[index]) {
      return { verified: [], mismatch: this.stuck }; // still bad -> stay halted
    }
    this.verified += u8.byteLength;
    this.cursor += 1;
    this.stuck = null;
    const rest = this.drain(); // verify any ahead-bytes that buffered during the gap
    return { verified: [u8, ...rest.verified], mismatch: rest.mismatch };
  }

  /** Verify as many complete pieces as the buffer allows, in order. */
  private drain(): VerifyResult {
    const out: Uint8Array[] = [];
    if (this.stuck !== null) return { verified: out, mismatch: this.stuck };
    for (;;) {
      if (this.cursor * this.manifest.pieceSize >= this.manifest.size) break; // all pieces done
      const need = this.lengthOf(this.cursor);
      if (this.pendingLen < need) break; // piece incomplete — wait for more bytes
      const piece = this.takePiece(need);
      if (hashPiece(piece) === this.manifest.hashes[this.cursor]) {
        out.push(piece);
        this.verified += need;
        this.cursor += 1;
      } else {
        this.stuck = this.cursor; // bad piece: drop it, halt, keep ahead-bytes buffered
        return { verified: out, mismatch: this.stuck };
      }
    }
    return { verified: out, mismatch: null };
  }

  /** Pull exactly `len` bytes off the front of the pending buffer. */
  private takePiece(len: number): Uint8Array {
    // Fast path: the piece is exactly one contiguous buffered slice — no copy.
    if (this.pending.length === 1 && this.pending[0].byteLength === len) {
      const only = this.pending[0];
      this.pending = [];
      this.pendingLen = 0;
      return only;
    }
    const out = new Uint8Array(len);
    let off = 0;
    while (off < len) {
      const head = this.pending[0];
      const take = Math.min(head.byteLength, len - off);
      out.set(head.subarray(0, take), off);
      off += take;
      if (take === head.byteLength) this.pending.shift();
      else this.pending[0] = head.subarray(take);
    }
    this.pendingLen -= len;
    return out;
  }
}
