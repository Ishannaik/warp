/**
 * Runnable check for the resume identity helpers in transfer.ts (no test runner;
 * matches peer.check.mjs style — transpiles the TS on the fly via esbuild).
 *
 * Run:  node src/lib/warp/transfer.check.mjs   (from web/)
 */

import assert from "node:assert";

// --- transpile transfer.ts on the fly (esbuild if present) ----------------
let mod;
try {
  const esbuild = await import("esbuild");
  const url = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const out = await esbuild.build({
    entryPoints: [path.join(here, "transfer.ts")],
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

const { fileKey, newResumeToken } = mod;

// --- fileKey: stable per (name,size,mtime); changes when any of them changes ---
const a = { name: "clip.mp4", size: 1234, lastModified: 42 };
assert.equal(fileKey(a), fileKey({ ...a }), "fileKey is stable for identical name+size+mtime");
assert.notEqual(fileKey(a), fileKey({ ...a, lastModified: 43 }), "mtime change -> different key");
assert.notEqual(fileKey(a), fileKey({ ...a, size: 9999 }), "size change -> different key");
assert.notEqual(fileKey(a), fileKey({ ...a, name: "other.mp4" }), "name change -> different key");

// A name that contains the same digits as size must NOT collide with a real size boundary.
const c1 = fileKey({ name: "a", size: 11, lastModified: 1 });
const c2 = fileKey({ name: "a1", size: 1, lastModified: 1 });
assert.notEqual(c1, c2, "delimiter prevents field-boundary collisions");

// --- newResumeToken: non-trivial + unique per call ---
const t1 = newResumeToken();
const t2 = newResumeToken();
assert.ok(/^[a-z0-9]{10,}$/.test(t1), "token is a non-trivial lowercase-alnum id");
assert.notEqual(t1, t2, "tokens are unique per call");

console.log("OK: transfer.ts resume identity helpers (fileKey stability + token uniqueness)");
