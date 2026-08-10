/**
 * Runnable check for the folder noise-filter helpers in noiseFilter.ts (no
 * test runner; matches roomCode.check.mjs style — transpiles the TS on the
 * fly via esbuild).
 *
 * Run:  node src/lib/warp/noiseFilter.check.mjs   (from web/)
 */

import assert from "node:assert";

// --- transpile noiseFilter.ts on the fly (esbuild if present) --------------
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
  entryPoints: [path.join(here, "noiseFilter.ts")],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const code = out.outputFiles[0].text;
const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
const mod = await import(dataUrl);

const { isNoiseFile, filterNoiseFiles } = mod;

// Duck-typed stand-in for a File picked via the folder input — only
// webkitRelativePath and name are read by the filter.
function fakeFile(webkitRelativePath) {
  const segments = webkitRelativePath.split("/");
  return { webkitRelativePath, name: segments[segments.length - 1] };
}

// --- isNoiseFile: matches denylisted directory segments and filenames ---
assert.ok(isNoiseFile(fakeFile("myproject/node_modules/lodash/index.js")), "node_modules subtree is noise");
assert.ok(isNoiseFile(fakeFile("myproject/.git/HEAD")), ".git subtree is noise");
assert.ok(isNoiseFile(fakeFile("myproject/.DS_Store")), ".DS_Store file is noise");
assert.ok(isNoiseFile(fakeFile("myproject/nested/dir/.DS_Store")), ".DS_Store is matched at any depth");
assert.ok(isNoiseFile(fakeFile("myproject/dist/bundle.js")), "dist subtree is noise");
assert.ok(isNoiseFile(fakeFile("myproject/build/out.js")), "build subtree is noise");
assert.ok(isNoiseFile(fakeFile("myproject/.next/cache/x.json")), ".next subtree is noise");

assert.ok(!isNoiseFile(fakeFile("myproject/src/index.ts")), "regular source file is not noise");
assert.ok(!isNoiseFile(fakeFile("myproject/README.md")), "regular root file is not noise");
assert.ok(
  !isNoiseFile(fakeFile("myproject/src/node_modules_helper.ts")),
  "partial segment match (not an exact folder name) is not noise",
);
assert.ok(
  !isNoiseFile({ webkitRelativePath: "", name: "loose.txt" }),
  "a file with no webkitRelativePath (not from a folder pick) always passes through",
);
assert.ok(
  !isNoiseFile({ name: "loose.txt" }),
  "a file with webkitRelativePath entirely absent (plain multi-file picker) always passes through",
);

// --- filterNoiseFiles: splits a list into included/excluded, order preserved ---
const files = [
  fakeFile("myproject/src/index.ts"),
  fakeFile("myproject/node_modules/lodash/index.js"),
  fakeFile("myproject/.git/HEAD"),
  fakeFile("myproject/README.md"),
  fakeFile("myproject/.DS_Store"),
];
const { included, excluded } = filterNoiseFiles(files);
assert.deepEqual(
  included.map((f) => f.webkitRelativePath),
  ["myproject/src/index.ts", "myproject/README.md"],
  "included keeps only non-noise files, in original order",
);
assert.deepEqual(
  excluded.map((f) => f.webkitRelativePath),
  ["myproject/node_modules/lodash/index.js", "myproject/.git/HEAD", "myproject/.DS_Store"],
  "excluded collects only noise files, in original order",
);

// An all-clean or all-noise list is handled without dropping anything unexpected.
const allClean = [fakeFile("a/one.txt"), fakeFile("a/two.txt")];
assert.equal(filterNoiseFiles(allClean).excluded.length, 0, "no false positives on a clean folder");
const allNoise = [fakeFile("a/node_modules/x.js"), fakeFile("a/.git/config")];
assert.equal(filterNoiseFiles(allNoise).included.length, 0, "an all-noise folder excludes everything");

console.log("OK: noiseFilter.ts isNoiseFile() denylist matching + filterNoiseFiles() include/exclude split");
