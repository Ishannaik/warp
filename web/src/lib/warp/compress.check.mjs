/**
 * Runnable check for the optional per-file compression module (issue #130). The
 * module is pure apart from the Compression Streams API, which Node ships (gzip +
 * deflate; zstd is browser-only for now), so the round-trip runs for real here.
 * We assert the MIME allowlist, the codec preference/intersection logic, feature
 * detection, and a byte-exact compress -> decompress round-trip.
 *
 * Run:  node src/lib/warp/compress.check.mjs   (from web/)
 */

import assert from "node:assert";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));

let supportedCodecs, isCompressible, chooseCodec, compressChunk, decompressChunk;
try {
  const esbuild = await import("esbuild");
  const out = await esbuild.build({
    entryPoints: [path.join(here, "compress.ts")],
    bundle: true,
    format: "esm",
    write: false,
    platform: "neutral",
  });
  const dataUrl = "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64");
  ({ supportedCodecs, isCompressible, chooseCodec, compressChunk, decompressChunk } = await import(dataUrl));
} catch (e) {
  console.error("SKIP: esbuild not available —", e.message);
  process.exit(0);
}

// --- isCompressible: an allowlist, raw when in doubt ------------------------------
assert.equal(isCompressible("text/plain"), true, "text/plain compresses");
assert.equal(isCompressible("text/html"), true, "text/html compresses");
assert.equal(isCompressible("application/json"), true, "JSON compresses");
assert.equal(isCompressible("application/ld+json"), true, "structured +json compresses");
assert.equal(isCompressible("application/vnd.api+json"), true, "any +json suffix compresses");
assert.equal(isCompressible("application/atom+xml"), true, "any +xml suffix compresses");
assert.equal(isCompressible("application/wasm"), true, "wasm compresses");
assert.equal(isCompressible("image/svg+xml"), true, "SVG (text) compresses");
assert.equal(isCompressible("APPLICATION/JSON"), true, "match is case-insensitive");
// Already-compressed / unknown media: send raw.
assert.equal(isCompressible("image/jpeg"), false, "JPEG is already compressed");
assert.equal(isCompressible("image/png"), false, "PNG is already compressed");
assert.equal(isCompressible("video/mp4"), false, "video is already compressed");
assert.equal(isCompressible("audio/ogg"), false, "audio is already compressed");
assert.equal(isCompressible("application/zip"), false, "archives are already compressed");
assert.equal(isCompressible("application/octet-stream"), false, "unknown octet-stream stays raw");
assert.equal(isCompressible(""), false, "no MIME stays raw");

// --- chooseCodec: preference order, intersected with what's mutually supported ----
assert.equal(chooseCodec("text/plain", ["zstd", "gzip"]), "zstd", "prefers zstd when both sides have it");
assert.equal(chooseCodec("text/plain", ["gzip"]), "gzip", "falls back to gzip without zstd");
assert.equal(chooseCodec("text/plain", ["gzip", "zstd"]), "zstd", "preference wins over the advertised order");
assert.equal(chooseCodec("text/plain", []), undefined, "no shared codec -> raw");
assert.equal(chooseCodec("image/png", ["zstd", "gzip"]), undefined, "incompressible MIME -> raw even with codecs");

// --- supportedCodecs: feature detection (Node has gzip; zstd is browser-only) -----
const supported = supportedCodecs();
assert.ok(Array.isArray(supported), "supportedCodecs returns an array");
assert.ok(supported.includes("gzip"), "this environment supports gzip");
assert.ok(
  supported.every((c) => c === "zstd" || c === "gzip"),
  "only known codecs are reported",
);

// --- round-trip: compress -> decompress is byte-exact -----------------------------
// Highly compressible content, so we can also assert the compressed form is smaller.
const text = "warp ".repeat(2000); // 12 KB of repetitive text
const plain = new TextEncoder().encode(text);
for (const codec of supported) {
  const packed = await compressChunk(plain, codec);
  assert.ok(packed instanceof ArrayBuffer, `${codec}: compressChunk returns an ArrayBuffer`);
  assert.ok(packed.byteLength < plain.byteLength, `${codec}: compressible input actually shrinks`);
  const unpacked = await decompressChunk(packed, codec);
  assert.equal(unpacked.byteLength, plain.byteLength, `${codec}: round-trip restores the exact length`);
  assert.deepEqual(new Uint8Array(unpacked), plain, `${codec}: round-trip is byte-exact`);
}

// A view (not a whole buffer) compresses only its bytes — the send pump slices a
// 4 MiB read block into views, so this is the exact shape it hands the compressor.
const backing = new Uint8Array(1024);
for (let i = 0; i < backing.length; i += 1) backing[i] = 65 + (i % 26); // repetitive letters
const view = backing.subarray(100, 600); // a window into the middle
const packedView = await compressChunk(view, supported[0]);
const unpackedView = await decompressChunk(packedView, supported[0]);
assert.deepEqual(new Uint8Array(unpackedView), view, "a subarray view round-trips to just its own bytes");

// Binary (non-text) round-trip: arbitrary bytes must survive too.
const binary = new Uint8Array(4096);
for (let i = 0; i < binary.length; i += 1) binary[i] = (i * 31 + 7) & 0xff;
const packedBin = await compressChunk(binary, supported[0]);
const unpackedBin = await decompressChunk(packedBin, supported[0]);
assert.deepEqual(new Uint8Array(unpackedBin), binary, "arbitrary binary round-trips byte-exact");

console.log("OK: compress — MIME allowlist, codec preference/intersection, feature detection, byte-exact round-trip");
