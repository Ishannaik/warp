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
  console.error("FAIL: esbuild is required for imageConvert.check.mjs —", e.message);
  process.exit(1);
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

const { isHeicMime, jpegFilename, convertToJpeg, exceedsConvertSizeCap } = mod;

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

// --- exceedsConvertSizeCap: tested directly, not through convertToJpeg, since
// in a no-DOM environment (this check) every oversized-input call would also
// return undefined via the DOM feature-detect below it — masking a regression
// in the cap itself. Regression coverage for the P1 finding on #260: an
// eager, unbounded decode of a dimension-heavy photo could stall the tab or
// exhaust memory before the user ever asked for a JPEG.
const CAP = 50 * 1024 * 1024;
assert.equal(exceedsConvertSizeCap(CAP), false, "exactly at the cap is allowed");
assert.equal(exceedsConvertSizeCap(CAP + 1), true, "one byte over the cap is rejected");
assert.equal(exceedsConvertSizeCap(0), false, "an empty source is allowed");

console.log("OK: imageConvert.ts isHeicMime + jpegFilename + convertToJpeg's no-DOM feature-detect path + the size cap");
