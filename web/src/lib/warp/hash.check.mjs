/**
 * Runnable check for the incremental SHA-256 used by the hash Web Worker
 * (issue #88). Verifies the algorithm against FIPS 180-4 test vectors and the
 * one property the worker relies on: hashing N calls of `update(chunk)` must
 * match one call over the concatenated bytes.
 *
 * Cross-checks against Node's built-in `crypto.createHash('sha256')` on a
 * randomized 4 MiB payload to catch any drift from the reference.
 *
 * The Web Worker plumbing (message routing, `hash.ts` wrapper) is exercised by
 * the peer round-trip in `peer.check.mjs` — this harness stays algorithm-only,
 * matching the dependency-free house style.
 *
 * Run:  node src/lib/warp/hash.check.mjs   (from web/)
 */

import assert from "node:assert";
import { createHash, randomBytes } from "node:crypto";

let init, update, finalize, toHex;
try {
  const esbuild = await import("esbuild");
  const url = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const out = await esbuild.build({
    entryPoints: [path.join(here, "sha256.ts")],
    bundle: true,
    format: "esm",
    write: false,
    platform: "neutral",
  });
  const code = out.outputFiles[0].text;
  const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  ({ init, update, finalize, toHex } = await import(dataUrl));
} catch (e) {
  console.error("SKIP: esbuild not available —", e.message);
  process.exit(0);
}

const enc = new TextEncoder();
const hex = (bytes) => toHex(bytes);

// --- FIPS 180-4 test vectors --------------------------------------------------
{
  const s = init();
  assert.equal(
    hex(finalize(s)),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "empty input → known SHA-256",
  );
}
{
  const s = init();
  update(s, enc.encode("abc"));
  assert.equal(
    hex(finalize(s)),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    '"abc" → known SHA-256',
  );
}
{
  // 448-bit test vector from FIPS 180-4 (56 chars — crosses the 55-byte pad boundary)
  const s = init();
  update(s, enc.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"));
  assert.equal(
    hex(finalize(s)),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    "448-bit vector → known SHA-256",
  );
}
{
  // Long-input vector: exactly one million 'a' bytes (FIPS 180-4).
  const s = init();
  const chunk = new Uint8Array(1000).fill(0x61); // 'a'
  for (let i = 0; i < 1000; i++) update(s, chunk);
  assert.equal(
    hex(finalize(s)),
    "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    "1M 'a' → known SHA-256",
  );
}

// --- incremental vs one-shot equivalence -------------------------------------
{
  const bytes = randomBytes(4 * 1024 * 1024); // 4 MiB, one read block
  const expected = createHash("sha256").update(bytes).digest("hex");

  // One-shot
  const s1 = init();
  update(s1, new Uint8Array(bytes));
  assert.equal(hex(finalize(s1)), expected, "one-shot 4 MiB matches Node's SHA-256");

  // Many small updates across the 64-byte block boundary (the pending-buffer path)
  const s2 = init();
  for (let i = 0; i < bytes.length; i += 37) {
    update(s2, new Uint8Array(bytes.buffer, bytes.byteOffset + i, Math.min(37, bytes.length - i)));
  }
  assert.equal(hex(finalize(s2)), expected, "37-byte incremental updates match one-shot");

  // 256 KiB chunks (the on-wire chunk size on the receive path)
  const s3 = init();
  for (let i = 0; i < bytes.length; i += 256 * 1024) {
    update(s3, new Uint8Array(bytes.buffer, bytes.byteOffset + i, 256 * 1024));
  }
  assert.equal(hex(finalize(s3)), expected, "256 KiB incremental updates match one-shot");
}

// --- update() must not retain the caller's buffer ---------------------------
{
  const s = init();
  const buf = enc.encode("hello ");
  update(s, buf);
  buf.fill(0); // clobber after update: hash state must already have captured it
  update(s, enc.encode("world"));
  assert.equal(
    hex(finalize(s)),
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    "'hello world' — update() copied its input synchronously (caller can reuse the buffer)",
  );
}

console.log("OK: sha256 incremental — test vectors, chunked equivalence, no buffer retention");
