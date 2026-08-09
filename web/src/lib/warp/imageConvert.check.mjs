/**
 * Runnable check for imageConvert.ts (no test runner; matches roomCode.check.mjs
 * style — transpiles the TS on the fly via esbuild).
 *
 * Run:  node src/lib/warp/imageConvert.check.mjs   (from web/)
 */

import assert from "node:assert";

// --- transpile imageConvert.ts on the fly (esbuild if present) -------------
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
  entryPoints: [path.join(here, "imageConvert.ts")],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const code = out.outputFiles[0].text;
const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const mod = await import(dataUrl);

const { isHeicMime, jpegFilename, convertToJpeg } = mod;

// --- isHeicMime ---
assert.equal(isHeicMime("image/heic"), true, "image/heic is targeted");
assert.equal(isHeicMime("image/heif"), true, "image/heif is targeted");
assert.equal(isHeicMime("image/jpeg"), false, "image/jpeg is not targeted");
assert.equal(isHeicMime("image/png"), false, "image/png is not targeted");
assert.equal(isHeicMime(""), false, "empty mime is not targeted");

// --- jpegFilename ---
assert.equal(jpegFilename("photo.heic"), "photo.jpg", "swaps the extension");
assert.equal(jpegFilename("photo.HEIC"), "photo.jpg", "swaps a mixed-case extension too");
assert.equal(jpegFilename("my.trip.heic"), "my.trip.jpg", "only the LAST extension is swapped");
assert.equal(jpegFilename("noext"), "noext.jpg", "no extension: appends one rather than mangling the name");

// --- convertToJpeg: feature-detects out cleanly with no DOM (Node has neither
// `document` nor `createImageBitmap`) — this IS the "browser can't decode"
// path from the caller's point of view, and must never throw.
const result = await convertToJpeg(new Blob(["not a real image"]));
assert.equal(result, undefined, "with no document/createImageBitmap, conversion is skipped, not thrown");

console.log("OK: imageConvert.ts isHeicMime + jpegFilename + convertToJpeg's no-DOM feature-detect path");
