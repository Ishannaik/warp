/**
 * Runnable check for the streaming "download all" helper (issue #28). No test
 * runner, no new deps — matches the other `*.check.mjs` harnesses. Bundles
 * zipDownload.ts (and thus fflate's streaming Zip) with esbuild, stubs the two
 * DOM bits saveBlob touches, drives a real archive build, then re-opens the
 * produced zip with fflate's unzipSync and asserts the entries round-trip
 * byte-for-byte (CRC-checked by unzipSync) and that names de-dupe.
 *
 * Run:  node src/lib/warp/zipDownload.check.mjs
 */

import assert from "node:assert";

// --- DOM stubs: capture the blob saveBlob hands to the anchor --------------
let downloaded = null; // { blob, filename }
const fakeAnchor = {
  href: "",
  download: "",
  click() {
    /* the object-URL capture below is what we assert on */
  },
  remove() {},
};
globalThis.document = { createElement: () => fakeAnchor, body: { appendChild() {}, removeChild() {} } };
const objectUrls = new Map();
globalThis.URL.createObjectURL = (blob) => {
  const url = "blob:fake-" + objectUrls.size;
  objectUrls.set(url, blob);
  return url;
};
globalThis.URL.revokeObjectURL = () => {};

// --- transpile zipDownload.ts on the fly (esbuild if present) --------------
let streamZipDownload;
let esbuild;
try {
  esbuild = await import("esbuild");
} catch (e) {
  console.error("SKIP: esbuild not available to transpile TS for this check —", e.message);
  process.exit(0);
}
const path = await import("node:path");
const url = await import("node:url");
const here = path.dirname(url.fileURLToPath(import.meta.url));
const out = await esbuild.build({
  entryPoints: [path.join(here, "zipDownload.ts")],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const code = out.outputFiles[0].text;
const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
({ streamZipDownload } = await import(dataUrl));

// fflate's synchronous unzip, for verifying the streamed archive. Resolves from
// the same dependency the helper bundles.
const { unzipSync, strFromU8 } = await import("fflate");

// Patch the anchor so a click records what was downloaded.
fakeAnchor.click = function () {
  downloaded = { blob: objectUrls.get(this.href), filename: this.download };
};

// --- the round-trip --------------------------------------------------------
const enc = new TextEncoder();
const entries = [
  { name: "a.txt", blob: new Blob([enc.encode("alpha contents")]) },
  { name: "b.bin", blob: new Blob([new Uint8Array([0, 1, 2, 250, 251, 252])]) },
  { name: "a.txt", blob: new Blob([enc.encode("second file, same name")]) }, // dup -> a (2).txt
  { name: "empty.dat", blob: new Blob([]) }, // zero-length entry
];
const total = entries.reduce((s, e) => s + e.blob.size, 0);

const progress = [];
await streamZipDownload(entries, "warp-files.zip", (done, tot) => {
  progress.push([done, tot]);
});

assert.ok(downloaded, "a download was triggered");
assert.equal(downloaded.filename, "warp-files.zip", "archive uses the requested name");
assert.ok(downloaded.blob, "download carried a blob");

// unzipSync verifies CRCs as it goes — a corrupt stream throws.
const zipBytes = new Uint8Array(await downloaded.blob.arrayBuffer());
const unzipped = unzipSync(zipBytes);
const names = Object.keys(unzipped).sort();
assert.deepEqual(
  names,
  ["a (2).txt", "a.txt", "b.bin", "empty.dat"],
  "duplicate names are de-duped, all entries present",
);
assert.equal(strFromU8(unzipped["a.txt"]), "alpha contents");
assert.equal(strFromU8(unzipped["a (2).txt"]), "second file, same name");
assert.deepEqual(Array.from(unzipped["b.bin"]), [0, 1, 2, 250, 251, 252]);
assert.equal(unzipped["empty.dat"].byteLength, 0, "empty entry round-trips as zero bytes");

// Progress reported monotonically up to the exact total.
assert.ok(progress.length > 0, "onProgress fired");
const [lastDone, lastTotal] = progress[progress.length - 1];
assert.equal(lastTotal, total, "progress total matches the input bytes");
assert.equal(lastDone, total, "progress reaches 100% of bytes");
for (let i = 1; i < progress.length; i += 1) {
  assert.ok(progress[i][0] >= progress[i - 1][0], "progress never goes backwards");
}

console.log("zipDownload.check: OK — streamed zip round-trips, de-dupes, reports progress");
