/**
 * Runnable check for the room-code format helpers in roomCode.ts (no test
 * runner; matches transfer.check.mjs style — transpiles the TS on the fly via
 * esbuild).
 *
 * Room codes are the only access secret, and roomCode.ts is deliberately a
 * *copy* of the server's alphabet rather than an import (the server is a
 * Cloudflare Worker; the client is a browser bundle). A copy drifts silently,
 * so this harness reads `server/src/index.js` and asserts parity against it
 * instead of asserting one hardcoded copy against another.
 *
 * Run:  node src/lib/warp/roomCode.check.mjs   (from web/)
 */

import assert from "node:assert";

// --- transpile roomCode.ts on the fly (esbuild if present) ----------------
let mod;
let esbuild;
try {
  esbuild = await import("esbuild");
} catch (e) {
  console.error("SKIP: esbuild not available to transpile TS for this check —", e.message);
  process.exit(0);
}
const url = await import("node:url");
const path = await import("node:path");
const fs = await import("node:fs");
const here = path.dirname(url.fileURLToPath(import.meta.url));
const out = await esbuild.build({
  entryPoints: [path.join(here, "roomCode.ts")],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const code = out.outputFiles[0].text;
const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
mod = await import(dataUrl);

const { CODE_LEN, VALID_RE, sanitize } = mod;

// --- CODE_LEN ------------------------------------------------------------
assert.equal(CODE_LEN, 6, "CODE_LEN is 6");

// --- parity with the signaling server ------------------------------------
// The server owns code minting (CONTRIBUTING.md hard constraint 7); these
// client helpers are format-only. If the two alphabets ever diverge, valid
// server codes get rejected client-side before the socket is even opened.
const serverPath = path.join(here, "..", "..", "..", "..", "server", "src", "index.js");
const serverSrc = fs.readFileSync(serverPath, "utf8");

const alphabetMatch = serverSrc.match(/const\s+CODE_ALPHABET\s*=\s*['"]([^'"]+)['"]/);
assert.ok(
  alphabetMatch,
  `could not find CODE_ALPHABET in ${path.relative(here, serverPath)} — if it was renamed, update this check rather than deleting it`,
);
const serverAlphabet = alphabetMatch[1];

const serverLenMatch = serverSrc.match(/const\s+CODE_LEN\s*=\s*(\d+)/);
assert.ok(serverLenMatch, "could not find CODE_LEN in the server source");
assert.equal(
  Number(serverLenMatch[1]),
  CODE_LEN,
  "server CODE_LEN and client CODE_LEN agree",
);

// Derive what VALID_RE actually accepts, character by character, instead of
// re-reading the character class by eye. Covers every printable ASCII plus a
// couple of look-alikes that a phone keyboard can produce.
const probes = [];
for (let c = 0x20; c <= 0x7e; c += 1) probes.push(String.fromCharCode(c));
probes.push("Ø", "é", "０" /* fullwidth zero */, "Ａ" /* fullwidth A */);

// Probe each position independently rather than with ch.repeat(CODE_LEN). Repeating
// asks "is this character valid in every position at once", which is a different and
// weaker question: a class like /^[A-Z][A-HJ-KM-NP-Z2-9]{5}$/ accepts "I" at index 0
// only, and "IIIIII" still fails, so a repeat-based probe would report "I" rejected and
// miss the divergence entirely. Filling the other slots with a known-good character
// isolates one position at a time.
const filler = serverAlphabet[0];
for (let pos = 0; pos < CODE_LEN; pos += 1) {
  const acceptedHere = probes.filter((ch) => {
    const candidate = filler.repeat(pos) + ch + filler.repeat(CODE_LEN - pos - 1);
    return VALID_RE.test(candidate);
  });
  assert.deepEqual(
    acceptedHere.slice().sort(),
    serverAlphabet.split("").sort(),
    `at index ${pos}, VALID_RE accepts exactly the server's CODE_ALPHABET — no more, no less`,
  );
}

// sanitize must keep exactly that alphabet too (after uppercasing), or a user
// pasting a valid code could have a character silently eaten.
for (const ch of probes) {
  const upper = ch.toUpperCase();
  const expected = serverAlphabet.includes(upper) ? upper : "";
  assert.equal(
    sanitize(ch),
    expected,
    `sanitize(${JSON.stringify(ch)}) keeps it iff the server alphabet has ${JSON.stringify(upper)}`,
  );
}

// The three ambiguous letters and two ambiguous digits, called out explicitly
// because they are the reason the alphabet is not just A-Z0-9.
for (const ch of ["0", "O", "1", "I", "L", "l", "o", "i"]) {
  assert.equal(sanitize(ch), "", `ambiguous ${JSON.stringify(ch)} is dropped by sanitize`);
  assert.ok(!VALID_RE.test(ch.repeat(CODE_LEN)), `ambiguous ${JSON.stringify(ch)} is rejected by VALID_RE`);
}

// --- sanitize ------------------------------------------------------------
assert.equal(sanitize("ab cd-ef"), "ABCDEF", "lowercase, spaces and dashes are normalised away");
assert.equal(sanitize("A2B3C4"), "A2B3C4", "an already-valid code survives unchanged");
assert.equal(sanitize("  a2 b3-c4  "), "A2B3C4", "surrounding whitespace is stripped");
assert.equal(sanitize(""), "", "empty input stays empty");
assert.equal(sanitize("0O1IL"), "", "a code of nothing but ambiguous characters sanitises to empty");
assert.equal(sanitize("A2B3C4D5"), "A2B3C4", "input longer than CODE_LEN is capped, not rejected");
assert.equal(
  sanitize("a2b3c4d5e6").length,
  CODE_LEN,
  "the cap is CODE_LEN characters, counted after filtering",
);
// Dropping happens before the cap: the ambiguous chars must not consume slots.
assert.equal(sanitize("0A12B3IC4L"), "A2B3C4", "ambiguous characters are dropped before the cap is applied");

// sanitize is idempotent — ReceiveEntry re-sanitises on every keystroke.
for (const raw of ["ab cd-ef", "0A12B3IC4L", "A2B3C4D5", ""]) {
  assert.equal(sanitize(sanitize(raw)), sanitize(raw), `sanitize is idempotent for ${JSON.stringify(raw)}`);
}

// --- VALID_RE ------------------------------------------------------------
assert.ok(VALID_RE.test("A2B3C4"), "VALID_RE accepts a well-formed code");
assert.ok(!VALID_RE.test("a2b3c4"), "VALID_RE rejects lowercase — sanitize uppercases first, the regex does not");
assert.ok(!VALID_RE.test("A2B3C"), "VALID_RE rejects a code one character short");
assert.ok(!VALID_RE.test("A2B3C45"), "VALID_RE rejects a code one character too long");
assert.ok(!VALID_RE.test(""), "VALID_RE rejects the empty string");
assert.ok(!VALID_RE.test(" A2B3C4"), "VALID_RE is anchored at the start");
assert.ok(!VALID_RE.test("A2B3C4 "), "VALID_RE is anchored at the end");
assert.ok(!VALID_RE.test("A2B3C4\nA2B3C4"), "VALID_RE anchors reject a trailing newline, not just $-per-line");

// VALID_RE's length quantifier and CODE_LEN must move together — the regex
// hardcodes {6} rather than interpolating CODE_LEN, so nothing but this
// assertion couples them.
const anyValidChar = serverAlphabet[0];
assert.ok(VALID_RE.test(anyValidChar.repeat(CODE_LEN)), "VALID_RE accepts exactly CODE_LEN characters");
assert.ok(!VALID_RE.test(anyValidChar.repeat(CODE_LEN - 1)), "VALID_RE rejects CODE_LEN - 1 characters");
assert.ok(!VALID_RE.test(anyValidChar.repeat(CODE_LEN + 1)), "VALID_RE rejects CODE_LEN + 1 characters");

// Anything sanitize produces at full length is, by construction, a valid code.
assert.ok(
  VALID_RE.test(sanitize("ab cd-ef")),
  "a full-length sanitize result always satisfies VALID_RE",
);

console.log(
  "OK: roomCode.ts — CODE_LEN, sanitize (normalise/drop-then-cap/idempotent), VALID_RE anchoring and length, and alphabet parity with server/src/index.js",
);
