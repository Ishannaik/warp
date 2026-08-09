/**
 * Runnable check for guardTargetFor in receiveGuards.ts (no test runner;
 * matches roomCode.check.mjs style — transpiles the TS on the fly via esbuild).
 *
 * This is the mutation test from #257: guardTargetFor is the one line the
 * whole pause/resume feature turns on (pause parks the key, cancel poisons
 * the sink), and a mirrored harness that reproduces the hook's logic instead
 * of calling the real export can't catch a regression in the line it mirrors.
 *
 * Run:  node src/lib/warp/receiveGuards.check.mjs   (from web/)
 */

import assert from "node:assert";

// --- transpile receiveGuards.ts on the fly (esbuild if present) ------------
let esbuild;
try {
  esbuild = await import("esbuild");
} catch (e) {
  console.error("FAIL: esbuild is required for receiveGuards.check.mjs —", e.message);
  process.exit(1);
}

const url = await import("node:url");
const path = await import("node:path");
const here = path.dirname(url.fileURLToPath(import.meta.url));
const out = await esbuild.build({
  entryPoints: [path.join(here, "receiveGuards.ts")],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const code = out.outputFiles[0].text;
const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const mod = await import(dataUrl);

const { guardTargetFor } = mod;

// --- the one line the feature turns on: paused + receive -> "paused" -------
assert.equal(
  guardTargetFor("paused", "receive"),
  "paused",
  "a paused receive parks the key and must NOT poison the sink",
);
assert.notEqual(
  guardTargetFor("paused", "receive"),
  "cancelled",
  "pause must never route to the cancelled set — resume depends on a healthy sink",
);

// --- direction: only receive carries a guard; send never does -------------
for (const status of ["offered", "transferring", "reconnecting", "paused", "done", "declined", "cancelled", "error"]) {
  assert.equal(guardTargetFor(status, "send"), "none", `send side never guards (status: ${status})`);
}

// --- status: every non-paused status on the receive side is "none" here ---
// (cancel is handled by cancel()'s own path, not this listener — see the
// comment in receiveGuards.ts.)
for (const status of ["offered", "transferring", "reconnecting", "done", "declined", "cancelled", "error"]) {
  assert.equal(guardTargetFor(status, "receive"), "none", `receive side only guards on "paused" (status: ${status})`);
}

console.log("OK: receiveGuards.ts guardTargetFor pause-vs-cancel decision, all statuses x both directions");
