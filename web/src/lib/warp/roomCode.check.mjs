/**
 * Runnable check for the room-code helpers in roomCode.ts (no test runner;
 * matches transfer.check.mjs style — transpiles the TS on the fly via esbuild).
 *
 * Run:  node src/lib/warp/roomCode.check.mjs   (from web/)
 */

import assert from "node:assert";

// --- transpile roomCode.ts on the fly (esbuild if present) -----------------
let esbuild;
try {
  esbuild = await import("esbuild");
} catch (e) {
  console.error("SKIP: esbuild not available to transpile TS for this check —", e.message);
  process.exit(0);
}

const url = await import("node:url");
const path = await import("node:path");
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
const mod = await import(dataUrl);

const { CODE_LEN, VALID_RE, sanitize } = mod;

// --- CODE_LEN: matches the server's minted code length ---
assert.equal(CODE_LEN, 6, "CODE_LEN is 6, matching server/src/index.js CODE_LEN");

// --- sanitize: uppercase, strip whitespace/dashes, drop disallowed chars, cap at CODE_LEN ---
assert.equal(sanitize("ab cd-ef"), "ABCDEF", "lowercase input is uppercased and whitespace/dashes stripped");
assert.equal(sanitize("a2b3c4"), "A2B3C4", "lowercase alphanumerics survive uppercased");
assert.equal(sanitize("A2B3C4EXTRA"), "A2B3C4", "input longer than CODE_LEN is capped");
assert.equal(sanitize(""), "", "empty input stays empty");

// Ambiguous chars (0 O 1 I L) are outside the server alphabet and must be dropped, not mapped.
assert.equal(sanitize("A0B1C"), "ABC", "digits 0 and 1 are dropped as ambiguous");
assert.equal(sanitize("AOBILC"), "ABC", "letters O, I, L are dropped as ambiguous");
assert.equal(sanitize("--  --"), "", "whitespace/dashes-only input sanitizes to empty");

// --- VALID_RE: accepts the server alphabet, rejects everything else ---
assert.ok(VALID_RE.test("A2B3C4"), "well-formed server-alphabet code is accepted");
assert.ok(!VALID_RE.test("a2b3c4"), "lowercase is rejected");
assert.ok(!VALID_RE.test("A2B3C"), "too short is rejected");
assert.ok(!VALID_RE.test("A2B3C44"), "too long is rejected");
assert.ok(!VALID_RE.test("A2B3CI"), "ambiguous letter I is rejected");
assert.ok(!VALID_RE.test("A2B3CO"), "ambiguous letter O is rejected");
assert.ok(!VALID_RE.test("A2B3C0"), "ambiguous digit 0 is rejected");
assert.ok(!VALID_RE.test("A2B3C1"), "ambiguous digit 1 is rejected");
assert.ok(!VALID_RE.test("A2B3CL"), "ambiguous letter L is rejected");

// Every sanitize() output that reaches CODE_LEN, drawn only from allowed chars, must validate.
for (let i = 0; i < 200; i++) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let raw = "";
  for (let j = 0; j < CODE_LEN; j++) raw += alphabet[Math.floor(Math.random() * alphabet.length)];
  const clean = sanitize(raw);
  assert.equal(clean, raw, "sanitize is a no-op on already-clean, full-length codes");
  assert.ok(VALID_RE.test(clean), "sanitize output of full length from the allowed alphabet always validates");
}

console.log("OK: roomCode.ts sanitize() happy path + ambiguous-char stripping + VALID_RE accept/reject boundaries");
