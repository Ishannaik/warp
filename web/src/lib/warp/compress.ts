/**
 * Optional per-file compression for the send path (issue #130, research-2026-07 §5/P2).
 *
 * The Compression Streams API is Baseline (gzip/deflate since May 2023; zstd in
 * Chrome 123, Firefox 126, Safari 18). For COMPRESSIBLE payloads — text, JSON, XML,
 * source, documents, databases — compressing before the bytes hit the data channel
 * is a pure client-side throughput win: fewer SCTP messages, and fewer bytes across
 * a constrained mobile uplink. It also shrinks what the receiver stages.
 *
 * Design choices, and why:
 *   - PER-CHUNK, not whole-file. Each send chunk is compressed independently, so the
 *     receiver decompresses each chunk on arrival with no cross-chunk state. That
 *     keeps the receive path stateless, preserves byte-offset resume (offsets stay
 *     in PLAINTEXT bytes — the sender resumes reading plaintext at the receiver's
 *     durable count and compresses from there), and means a transport drop never
 *     strands a half-fed compression context. The ratio cost versus one whole-file
 *     context is modest at 256 KiB chunks; correctness and resume-safety win.
 *   - NEGOTIATED, never assumed. The receiver advertises the codecs it can
 *     decompress in its `accept` frame; the sender compresses ONLY when the file is
 *     compressible AND the receiver advertised a codec the sender also supports
 *     (peer.ts intersects the two). A receiver that advertises nothing (an older
 *     bundle, or a stack without CompressionStream) gets raw bytes exactly as before
 *     — fully backward compatible. The chosen codec rides in `file-begin` so the
 *     receiver knows whether each binary frame is compressed.
 *   - OFF for already-compressed media. Images (JPEG/PNG/WebP), video, audio, and
 *     archives are compressed on the wire already; re-compressing wastes CPU for a
 *     rounding-error size change (sometimes negative). `isCompressible()` is an
 *     allowlist, so unknown/octet-stream payloads are sent raw.
 *
 * The sync access handle / disk / IDB / memory sinks all receive PLAINTEXT: the
 * receiver decompresses before `sink.append`, so stored bytes and the off-thread
 * integrity hash (which the sender computes over plaintext too) stay consistent.
 */

/** A compression codec both peers must support for it to be used. */
export type Codec = "zstd" | "gzip";

/**
 * Minimal structural type for the Compression Streams. `lib.dom`'s `CompressionFormat`
 * predates `zstd` (a browser-shipped codec we prefer), so we go through a constructor
 * typed to accept any format string rather than fight the built-in union.
 */
interface ByteStreamWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
interface ByteStream {
  readable: ReadableStream<Uint8Array>;
  writable: { getWriter(): ByteStreamWriter };
}
type ByteStreamCtor = new (format: string) => ByteStream;

/**
 * Preference order. zstd is both denser and faster where available; gzip is the
 * universal floor (every browser with CompressionStream ships it, and Node's
 * harness has it too). `supportedCodecs()` and `chooseCodec()` both walk this list,
 * so the single best mutually-supported codec is always picked.
 */
const PREFERENCE: Codec[] = ["zstd", "gzip"];

/**
 * Codecs this environment can BOTH compress and decompress, in preference order.
 * Feature-detected by constructing the streams: an unknown codec makes the
 * constructor throw (TypeError/RangeError depending on the engine), so a try/catch
 * per codec is the probe. Returns [] where CompressionStream is absent entirely —
 * the sender then never compresses and the wire stays raw.
 */
export function supportedCodecs(): Codec[] {
  if (typeof CompressionStream === "undefined" || typeof DecompressionStream === "undefined") {
    return [];
  }
  const CS = CompressionStream as unknown as ByteStreamCtor;
  const DS = DecompressionStream as unknown as ByteStreamCtor;
  const out: Codec[] = [];
  for (const codec of PREFERENCE) {
    try {
      // Construct (and drop) both directions; either throwing rules the codec out.
      void new CS(codec);
      void new DS(codec);
      out.push(codec);
    } catch {
      /* codec unsupported here — skip it */
    }
  }
  return out;
}

/** MIME types that are already compressed on the wire — never re-compress these. */
const COMPRESSIBLE_PREFIXES = ["text/"];
const COMPRESSIBLE_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/x-ndjson",
  "application/xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/sql",
  "application/graphql",
  "application/wasm",
  "image/svg+xml",
]);

/**
 * Is this MIME worth compressing? An ALLOWLIST: text/* plus the structured/binary-
 * text types that compress well (JSON, XML, JS, SQL, wasm, SVG), plus any `+json` /
 * `+xml` structured suffix. Everything else — images, video, audio, archives, and
 * the unknown `application/octet-stream` default — is sent raw. When in doubt, raw:
 * a wasted compression pass on incompressible bytes is pure CPU loss.
 */
export function isCompressible(mime: string): boolean {
  const m = (mime || "").toLowerCase();
  if (!m || m === "application/octet-stream") return false;
  if (COMPRESSIBLE_PREFIXES.some((p) => m.startsWith(p))) return true;
  if (COMPRESSIBLE_TYPES.has(m)) return true;
  return m.endsWith("+json") || m.endsWith("+xml");
}

/**
 * Pick the codec for a file given the MUTUALLY-supported set (the caller intersects
 * the receiver's advertised codecs with the sender's own). Undefined when the file
 * isn't compressible or no shared codec exists — the caller then sends raw bytes.
 */
export function chooseCodec(mime: string, supported: Codec[]): Codec | undefined {
  if (!isCompressible(mime)) return undefined;
  for (const codec of PREFERENCE) {
    if (supported.includes(codec)) return codec;
  }
  return undefined;
}

/** Normalize a buffer or view to a Uint8Array the stream writer accepts. */
function toBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

/**
 * Run one chunk through a CompressionStream and collect the result. The reader is
 * started BEFORE writing so a codec that fills its internal buffer can't deadlock
 * the writer. Accepts a view (writes only its bytes) and returns a fresh ArrayBuffer
 * of just the compressed output.
 */
export async function compressChunk(buf: ArrayBuffer | Uint8Array, codec: Codec): Promise<ArrayBuffer> {
  const CS = CompressionStream as unknown as ByteStreamCtor;
  const stream = new CS(codec);
  const collected = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  await writer.write(toBytes(buf));
  await writer.close();
  return collected;
}

/** Inverse of compressChunk: expand one independently-compressed chunk to plaintext. */
export async function decompressChunk(buf: ArrayBuffer | Uint8Array, codec: Codec): Promise<ArrayBuffer> {
  const DS = DecompressionStream as unknown as ByteStreamCtor;
  const stream = new DS(codec);
  const collected = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  await writer.write(toBytes(buf));
  await writer.close();
  return collected;
}
