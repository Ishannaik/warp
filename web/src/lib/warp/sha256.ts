/**
 * Incremental SHA-256 (FIPS 180-4). Pure JavaScript, zero deps, ~120 lines.
 *
 * Why not `crypto.subtle.digest`? It has NO streaming API — you must hand it a
 * single complete buffer, so hashing a 2 GB file would mean holding the whole
 * file in RAM. That defeats the disk-streaming receive path (`receiveController.ts`)
 * that exists precisely so large transfers never sit in memory.
 *
 * Why not pull in a library? The web bundle already carries a 500 KB warning
 * (CONTRIBUTING §Constraints). SHA-256 is short, stable, and public-domain in
 * spirit; inlining it is cheaper than a dep.
 *
 * Ownership rule: `update()` reads the caller's `Uint8Array` synchronously and
 * doesn't retain a reference. Safe to reuse or discard the buffer after the
 * call returns.
 *
 * All CPU work belongs OFF the main thread — see `hashWorker.ts` for the only
 * place these functions are meant to run.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export interface Sha256State {
  h: Uint32Array;      // running hash (8 × 32-bit)
  buffer: Uint8Array;  // pending bytes waiting for a full 64-byte block
  bufferLen: number;
  totalBytes: number;  // total bytes fed via update() so far
}

export function init(): Sha256State {
  return {
    h: new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]),
    buffer: new Uint8Array(64),
    bufferLen: 0,
    totalBytes: 0,
  };
}

/** Process one 64-byte block starting at `offset` in `data`. */
function compress(h: Uint32Array, data: Uint8Array, offset: number): void {
  const w = new Uint32Array(64);
  for (let i = 0; i < 16; i++) {
    const o = offset + i * 4;
    w[i] = (data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3];
  }
  for (let i = 16; i < 64; i++) {
    const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
    const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const mj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + mj) | 0;
    hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
  h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

export function update(s: Sha256State, chunk: Uint8Array): void {
  s.totalBytes += chunk.byteLength;
  let i = 0;
  // Top up the pending buffer to 64 bytes first.
  if (s.bufferLen > 0) {
    const need = 64 - s.bufferLen;
    const take = Math.min(need, chunk.byteLength);
    s.buffer.set(chunk.subarray(0, take), s.bufferLen);
    s.bufferLen += take;
    i = take;
    if (s.bufferLen === 64) {
      compress(s.h, s.buffer, 0);
      s.bufferLen = 0;
    }
  }
  // Consume full 64-byte blocks in place (no copy).
  while (i + 64 <= chunk.byteLength) {
    compress(s.h, chunk, i);
    i += 64;
  }
  // Stash the tail for the next update.
  if (i < chunk.byteLength) {
    const tail = chunk.byteLength - i;
    s.buffer.set(chunk.subarray(i), 0);
    s.bufferLen = tail;
  }
}

export function finalize(s: Sha256State): Uint8Array {
  const bitLenHi = Math.floor(s.totalBytes / 0x20000000); // totalBytes * 8 high 32 bits
  const bitLenLo = (s.totalBytes * 8) >>> 0;              // low 32 bits
  // Pad: 0x80, zeros, then 64-bit big-endian length. Total padded length ≡ 0 (mod 64).
  const padLen = s.bufferLen < 56 ? 64 - s.bufferLen : 128 - s.bufferLen;
  const pad = new Uint8Array(padLen);
  pad[0] = 0x80;
  pad[padLen - 8] = (bitLenHi >>> 24) & 0xff;
  pad[padLen - 7] = (bitLenHi >>> 16) & 0xff;
  pad[padLen - 6] = (bitLenHi >>> 8) & 0xff;
  pad[padLen - 5] = bitLenHi & 0xff;
  pad[padLen - 4] = (bitLenLo >>> 24) & 0xff;
  pad[padLen - 3] = (bitLenLo >>> 16) & 0xff;
  pad[padLen - 2] = (bitLenLo >>> 8) & 0xff;
  pad[padLen - 1] = bitLenLo & 0xff;
  update(s, pad);
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (s.h[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (s.h[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (s.h[i] >>> 8) & 0xff;
    out[i * 4 + 3] = s.h[i] & 0xff;
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += (b < 16 ? "0" : "") + b.toString(16);
  }
  return out;
}
