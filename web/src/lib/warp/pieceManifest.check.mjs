/**
 * Runnable check for pieceManifest.ts (issue #137 / research P5) — no test runner,
 * matches the other engine harnesses (transpiles the TS on the fly via esbuild).
 *
 * Covers: known SHA-256 vectors, manifest shape, per-piece verify, the size-window
 * gate, and the streaming PieceVerifier — clean streams (aligned AND ragged chunk
 * sizes), corrupt-piece detection halting at the right index with the verified
 * prefix frozen before the bad piece, and targeted re-request via injectPiece
 * (correct bytes resume + complete; wrong bytes / wrong index stay halted).
 *
 * Run:  node src/lib/warp/pieceManifest.check.mjs   (from web/)
 */

import assert from "node:assert";

// --- transpile pieceManifest.ts (+ sha256.ts) on the fly --------------------
let mod;
try {
  const esbuild = await import("esbuild");
  const url = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const out = await esbuild.build({
    entryPoints: [path.join(here, "pieceManifest.ts")],
    bundle: true,
    format: "esm",
    write: false,
    platform: "neutral",
  });
  const code = out.outputFiles[0].text;
  const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  mod = await import(dataUrl);
} catch (e) {
  console.error("SKIP: esbuild not available to transpile TS for this check —", e.message);
  process.exit(0);
}

const {
  PIECE_SIZE,
  MAX_PIECES,
  choosePieceSize,
  MANIFEST_MIN_BYTES,
  MANIFEST_MAX_BYTES,
  shouldManifest,
  hashPiece,
  verifyPiece,
  pieceCount,
  pieceLength,
  manifestFromBytes,
  PieceVerifier,
} = mod;

const enc = (s) => new TextEncoder().encode(s);
const concat = (parts) => {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
};

// --- hashPiece: known FIPS 180-4 vectors ------------------------------------
assert.equal(
  hashPiece(enc("")),
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "SHA-256 of the empty string matches the published vector",
);
assert.equal(
  hashPiece(enc("abc")),
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  "SHA-256 of 'abc' matches the published vector",
);
// A piece longer than one 64-byte block exercises the multi-block path.
const long = new Uint8Array(1000).fill(7);
assert.equal(hashPiece(long), hashPiece(long.slice()), "hashing a view equals hashing a copy");
assert.notEqual(hashPiece(long), hashPiece(new Uint8Array(1000).fill(8)), "different bytes -> different digest");

// --- verifyPiece: case-insensitive hex compare ------------------------------
assert.equal(verifyPiece(enc("abc"), "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD"), true, "verify accepts upper-case hex");
assert.equal(verifyPiece(enc("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), true, "verify accepts lower-case hex");
assert.equal(verifyPiece(enc("abd"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), false, "verify rejects a wrong digest");

// --- pieceCount / pieceLength: boundaries -----------------------------------
assert.equal(pieceCount(0, PIECE_SIZE), 0, "empty file has zero pieces");
assert.equal(pieceCount(1, PIECE_SIZE), 1, "one byte is one (short) piece");
assert.equal(pieceCount(PIECE_SIZE, PIECE_SIZE), 1, "exactly one piece");
assert.equal(pieceCount(PIECE_SIZE + 1, PIECE_SIZE), 2, "one byte over rolls to two pieces");
assert.equal(pieceLength(PIECE_SIZE * 2 + 10, PIECE_SIZE, 0), PIECE_SIZE, "first piece is full");
assert.equal(pieceLength(PIECE_SIZE * 2 + 10, PIECE_SIZE, 1), PIECE_SIZE, "middle piece is full");
assert.equal(pieceLength(PIECE_SIZE * 2 + 10, PIECE_SIZE, 2), 10, "last piece is the short tail");
assert.equal(pieceLength(PIECE_SIZE * 2 + 10, PIECE_SIZE, 3), 0, "past-the-end piece has length 0");

// --- shouldManifest: the size window ----------------------------------------
assert.equal(shouldManifest(MANIFEST_MIN_BYTES - 1), false, "below the floor -> no manifest (tiny file)");
assert.equal(shouldManifest(MANIFEST_MIN_BYTES), true, "at the floor -> manifest");
assert.equal(shouldManifest(MANIFEST_MAX_BYTES), true, "at the ceiling -> manifest");
assert.equal(shouldManifest(MANIFEST_MAX_BYTES + 1), false, "above the ceiling -> no manifest (v1 upfront-hash bound)");

// --- choosePieceSize: scales so the manifest frame stays bounded ------------
assert.equal(choosePieceSize(MANIFEST_MIN_BYTES), PIECE_SIZE, "a small file keeps the 256 KiB wire-aligned floor");
assert.equal(choosePieceSize(MAX_PIECES * PIECE_SIZE), PIECE_SIZE, "exactly MAX_PIECES at the floor stays at the floor");
{
  const big = MAX_PIECES * PIECE_SIZE + 1; // one byte over -> must grow
  const ps = choosePieceSize(big);
  assert.ok(ps > PIECE_SIZE, "one byte over the floor capacity grows the piece size");
  assert.ok(pieceCount(big, ps) <= MAX_PIECES, "the grown piece size keeps the hash count within MAX_PIECES");
}
{
  const twoGib = 2 * 1024 * 1024 * 1024;
  const ps = choosePieceSize(twoGib);
  assert.ok(pieceCount(twoGib, ps) <= MAX_PIECES, "a 2 GiB file's manifest stays within MAX_PIECES hashes");
  // 512 hashes * ~67 bytes of JSON each stays under the 64 KiB default maxMessageSize.
  assert.ok(pieceCount(twoGib, ps) * 67 < 64 * 1024, "the 2 GiB manifest frame fits a 64 KiB data-channel message");
}

// --- manifestFromBytes: one hash per piece, correct digests -----------------
const ps = 8; // small piece size for a compact test
const data = enc("abcdefghijklmnopqrstuvwxyz"); // 26 bytes -> 4 pieces (8,8,8,2)
const manifest = manifestFromBytes(data, ps);
assert.equal(manifest.pieceSize, ps, "manifest records its piece size");
assert.equal(manifest.size, data.byteLength, "manifest records the total size");
assert.equal(manifest.hashes.length, 4, "26 bytes at piece size 8 is 4 pieces");
assert.equal(manifest.hashes[0], hashPiece(enc("abcdefgh")), "piece 0 digest is correct");
assert.equal(manifest.hashes[1], hashPiece(enc("ijklmnop")), "piece 1 digest is correct");
assert.equal(manifest.hashes[3], hashPiece(enc("yz")), "the short tail piece digest is correct");
assert.equal(manifestFromBytes(new Uint8Array(0), ps).hashes.length, 0, "empty file -> empty manifest");

// --- PieceVerifier: clean stream, piece-aligned chunks ----------------------
{
  const v = new PieceVerifier(manifest);
  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    const piece = data.subarray(i * ps, Math.min((i + 1) * ps, data.byteLength));
    const r = v.push(piece);
    assert.equal(r.mismatch, null, `aligned piece ${i} verifies`);
    seen.push(...r.verified);
  }
  assert.equal(v.done, true, "all pieces verified -> done");
  assert.equal(v.verifiedBytes, data.byteLength, "verifiedBytes reaches the full size");
  assert.equal(v.pendingBytes, 0, "nothing left buffered");
  assert.equal(concat(seen).length, data.byteLength, "every byte was emitted exactly once");
  assert.deepEqual(Array.from(concat(seen)), Array.from(data), "emitted bytes reassemble to the source");
}

// --- PieceVerifier: clean stream, RAGGED chunk sizes (not piece-aligned) ----
{
  const v = new PieceVerifier(manifest);
  const seen = [];
  // Feed 5-byte chunks across 26 bytes (5,5,5,5,5,1) — pieces are 8 bytes, so
  // chunks straddle piece boundaries. The verifier must still cut + verify.
  for (let off = 0; off < data.byteLength; off += 5) {
    const r = v.push(data.subarray(off, Math.min(off + 5, data.byteLength)));
    assert.equal(r.mismatch, null, "ragged feed never mismatches on clean data");
    seen.push(...r.verified);
  }
  assert.equal(v.done, true, "ragged clean feed completes");
  assert.deepEqual(Array.from(concat(seen)), Array.from(data), "ragged feed reassembles byte-exact");
}

// --- PieceVerifier: a corrupt piece halts at its index, prefix frozen (P5) ---
{
  const v = new PieceVerifier(manifest);
  const good0 = v.push(data.subarray(0, ps)); // piece 0 ok
  assert.equal(good0.mismatch, null, "piece 0 verifies");
  assert.equal(v.verifiedBytes, ps, "verified prefix is one piece");

  const bad1 = data.subarray(ps, 2 * ps).slice();
  bad1[3] ^= 0xff; // flip a byte in piece 1
  const r1 = v.push(bad1);
  assert.equal(r1.mismatch, 1, "the corrupt piece is localized to index 1");
  assert.equal(r1.verified.length, 0, "a failed piece emits nothing to the sink");
  assert.equal(v.verifiedBytes, ps, "verified prefix stays frozen BEFORE the bad piece (P5)");
  assert.equal(v.done, false, "a halted verifier is not done");

  // Ahead-bytes pushed while halted are buffered, not verified.
  const r2 = v.push(data.subarray(2 * ps, 3 * ps)); // piece 2 arrives early
  assert.equal(r2.mismatch, 1, "still halted while a mismatch is outstanding");
  assert.equal(r2.verified.length, 0, "buffered ahead-bytes are not verified yet");
  assert.equal(v.verifiedBytes, ps, "verified prefix still frozen");
  assert.ok(v.pendingBytes >= ps, "the ahead piece is buffered, not dropped");

  // A wrong-index inject is ignored.
  const wrongIdx = v.injectPiece(2, data.subarray(2 * ps, 3 * ps));
  assert.equal(wrongIdx.mismatch, 1, "injecting a non-halted index is a no-op");
  assert.equal(v.verifiedBytes, ps, "wrong-index inject does not advance");

  // A still-corrupt inject for the right index stays halted.
  const stillBad = bad1.slice();
  const badInject = v.injectPiece(1, stillBad);
  assert.equal(badInject.mismatch, 1, "re-supplying the same corrupt bytes stays halted");
  assert.equal(v.verifiedBytes, ps, "a still-bad inject does not advance");

  // The CORRECT piece 1 resumes verification and chains through the buffered tail.
  const fixed = v.injectPiece(1, data.subarray(ps, 2 * ps));
  assert.equal(fixed.mismatch, null, "the corrected piece clears the mismatch");
  // verified now includes piece 1 + the buffered piece 2 + (if fed) the rest.
  const all = concat([good0.verified[0], ...fixed.verified, ...v.push(data.subarray(3 * ps)).verified]);
  assert.equal(v.done, true, "verification completes after the targeted re-request");
  assert.equal(v.verifiedBytes, data.byteLength, "verifiedBytes reaches the full size after recovery");
  assert.deepEqual(Array.from(all), Array.from(data), "targeted re-request reassembles byte-exact");
}

// --- PieceVerifier: empty file is trivially done ----------------------------
{
  const v = new PieceVerifier(manifestFromBytes(new Uint8Array(0), ps));
  assert.equal(v.done, true, "an empty manifest verifies as done immediately");
  assert.equal(v.verifiedBytes, 0, "empty file verifies zero bytes");
  assert.equal(v.push(new Uint8Array(0)).mismatch, null, "pushing nothing stays healthy");
}

// --- PieceVerifier: trailing extra bytes are surfaced, not swallowed --------
{
  const v = new PieceVerifier(manifest);
  v.push(data); // whole file
  assert.equal(v.done, true, "full file verifies");
  v.push(enc("ZZ")); // sender overshot
  assert.equal(v.verifiedBytes, data.byteLength, "extra bytes do not advance the verified prefix");
  assert.equal(v.pendingBytes, 2, "trailing extra bytes are surfaced as pending, not silently accepted");
  assert.equal(v.done, false, "a file with trailing garbage is not 'done'");
}

console.log("OK: pieceManifest.ts — SHA-256 vectors, manifest shape, size window, streaming verifier (clean/ragged/corrupt-piece re-request, verified-prefix P5)");
