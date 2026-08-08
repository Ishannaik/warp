/**
 * Runnable check for the receive-strategy selection (issue #54). The module is
 * pure (no DOM beyond an injected capability object), so it runs straight in
 * Node: we assert the LARGE_THRESHOLD boundary, the capability detector against
 * fake `window` shapes, and the full chooseReceiveStrategy decision matrix that
 * useWarpTransfer.accept() and SessionView's AcceptModal both rely on.
 *
 * Run:  node src/lib/warp/receiveStrategy.check.mjs   (from web/)
 */

import assert from "node:assert";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));

let LARGE_THRESHOLD, detectFsAccessSupport, isLargeBatch, chooseReceiveStrategy;
let esbuild;
try {
  esbuild = await import("esbuild");
} catch (e) {
  console.error("SKIP: esbuild not available —", e.message);
  process.exit(0);
}
const out = await esbuild.build({
  entryPoints: [path.join(here, "receiveStrategy.ts")],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const dataUrl = "data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64");
({ LARGE_THRESHOLD, detectFsAccessSupport, isLargeBatch, chooseReceiveStrategy } = await import(dataUrl));

const MiB = 1024 * 1024;
assert.equal(LARGE_THRESHOLD, 256 * MiB, "LARGE_THRESHOLD is the shared 256 MiB line");

// --- isLargeBatch: total OR any-single-file crosses the line ---------------------
assert.equal(isLargeBatch(0, 0), false, "empty batch is not large");
assert.equal(isLargeBatch(LARGE_THRESHOLD - 1, LARGE_THRESHOLD - 1), false, "just under the line is not large");
assert.equal(isLargeBatch(LARGE_THRESHOLD, 1), true, "total at the line is large");
assert.equal(isLargeBatch(1, LARGE_THRESHOLD), true, "a single file at the line is large (total tiny)");
assert.equal(isLargeBatch(LARGE_THRESHOLD + 1, LARGE_THRESHOLD + 1), true, "over the line is large");

// --- detectFsAccessSupport: reads the two pickers off an injected window ---------
const both = { showSaveFilePicker: () => {}, showDirectoryPicker: () => {} };
assert.deepEqual(detectFsAccessSupport(both), { canSaveFile: true, canPickDirectory: true }, "both pickers");
assert.deepEqual(
  detectFsAccessSupport({ showSaveFilePicker: () => {} }),
  { canSaveFile: true, canPickDirectory: false },
  "save-file only",
);
assert.deepEqual(
  detectFsAccessSupport({ showDirectoryPicker: () => {} }),
  { canSaveFile: false, canPickDirectory: true },
  "directory only",
);
assert.deepEqual(detectFsAccessSupport({}), { canSaveFile: false, canPickDirectory: false }, "no pickers");
// Non-function picker values (a truthy non-function) must NOT count as support.
assert.deepEqual(
  detectFsAccessSupport({ showSaveFilePicker: true, showDirectoryPicker: "yes" }),
  { canSaveFile: false, canPickDirectory: false },
  "truthy non-function pickers are not support",
);
// No window at all (SSR / Node) -> both false, never a throw.
assert.deepEqual(detectFsAccessSupport(undefined), { canSaveFile: false, canPickDirectory: false }, "no window");

// --- chooseReceiveStrategy: the decision matrix accept() relies on ---------------
const FS_BOTH = { canSaveFile: true, canPickDirectory: true };
const FS_NONE = { canSaveFile: false, canPickDirectory: false };

// Small batch -> always memory, regardless of capability or shape.
assert.equal(chooseReceiveStrategy({ itemCount: 1, large: false, fs: FS_BOTH }), "memory", "small single -> memory");
assert.equal(chooseReceiveStrategy({ itemCount: 5, large: false, fs: FS_BOTH }), "memory", "small multi -> memory");

// Large single file -> disk-file when the save picker exists, else memory.
assert.equal(
  chooseReceiveStrategy({ itemCount: 1, large: true, fs: FS_BOTH }),
  "disk-file",
  "large single + save picker -> disk-file",
);
assert.equal(
  chooseReceiveStrategy({ itemCount: 1, large: true, fs: { canSaveFile: false, canPickDirectory: true } }),
  "memory",
  "large single without the save picker -> memory (a dir picker can't save one file)",
);

// Large multi-file batch -> disk-dir when the directory picker exists, else memory.
assert.equal(
  chooseReceiveStrategy({ itemCount: 3, large: true, fs: FS_BOTH }),
  "disk-dir",
  "large multi + dir picker -> disk-dir",
);
assert.equal(
  chooseReceiveStrategy({ itemCount: 3, large: true, fs: { canSaveFile: true, canPickDirectory: false } }),
  "memory",
  "large multi without the dir picker -> memory (a save picker can't take a folder)",
);

// No File System Access API at all -> memory for every large shape.
assert.equal(chooseReceiveStrategy({ itemCount: 1, large: true, fs: FS_NONE }), "memory", "large single, no FS API");
assert.equal(chooseReceiveStrategy({ itemCount: 9, large: true, fs: FS_NONE }), "memory", "large multi, no FS API");

console.log("OK: receiveStrategy — threshold boundary, capability detection, and the disk/memory decision matrix");
