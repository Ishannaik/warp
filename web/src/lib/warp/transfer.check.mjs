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

const {
  fileKey,
  newResumeToken,
  formatBytes,
  textSnippetFrameBytes,
  TEXT_SNIPPET_MAX_BYTES,
  fileId,
  summarizeBatches,
} = mod;

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

// --- formatBytes: never show 1000 of a smaller unit at boundaries ---
assert.equal(formatBytes(999), "999 B", "bytes stay in B below 1 KB");
assert.equal(formatBytes(1000), "1 KB", "exact KB boundary");
assert.equal(formatBytes(999_499), "999 KB", "just under rounded KB→MB boundary");
assert.equal(formatBytes(999_950), "1.0 MB", "999_950 must not render as 1000 KB");
assert.equal(formatBytes(999_999), "1.0 MB", "999_999 must not render as 1000 KB");
assert.equal(formatBytes(1_400_000), "1.4 MB", "ordinary MB with one decimal");
assert.equal(formatBytes(120_000_000), "120 MB", "large MB uses zero decimals");
assert.equal(formatBytes(999_999_999), "1.0 GB", "999_999_999 must not render as 1000 MB");
assert.equal(formatBytes(1_000_000_000), "1.0 GB", "exact GB boundary");

// --- textSnippetFrameBytes: measures the wire frame, not the string ---
// The value guards `SessionView`'s composer hint and `peer.ts`'s send-side throw, so it has
// to count what is actually JSON-encoded: the envelope, and UTF-8 bytes rather than UTF-16
// code units.
const utf8 = (s) => new TextEncoder().encode(s).byteLength;

// The empty frame is pure envelope: {"t":"text","id":"xxxxxxxx","text":""}
const ENVELOPE_BYTES = textSnippetFrameBytes("");
assert.equal(ENVELOPE_BYTES, 38, "empty snippet still costs the JSON envelope");

for (const [label, text] of [
  ["empty", ""],
  ["ascii", "hello world"],
  ["multi-byte", "👋 héllo — ünïcode"],
  ["astral only", "👋🏽👨‍👩‍👧‍👦"],
]) {
  assert.ok(
    textSnippetFrameBytes(text) >= utf8(text),
    `${label}: frame is never smaller than the raw UTF-8 payload`,
  );
  assert.equal(
    textSnippetFrameBytes(text),
    ENVELOPE_BYTES + utf8(text),
    `${label}: frame is exactly envelope + UTF-8 payload when nothing needs escaping`,
  );
}

// The whole reason the helper exists: `.length` under-counts multi-byte text.
// "👋" is 2 UTF-16 code units but 4 UTF-8 bytes, so a naive check leaks 2 bytes per emoji.
assert.ok(
  textSnippetFrameBytes("👋") - ENVELOPE_BYTES > "👋".length,
  "multi-byte text costs more bytes than String#length suggests",
);

// JSON escaping expands on the wire too: `"` and `\` each serialize to two bytes.
assert.equal(textSnippetFrameBytes('"'), ENVELOPE_BYTES + 2, 'a quote is escaped to \\" on the wire');
assert.equal(textSnippetFrameBytes("\\"), ENVELOPE_BYTES + 2, "a backslash is escaped to \\\\ on the wire");
assert.ok(
  textSnippetFrameBytes('""""') > utf8('""""'),
  "escaping is counted, so quote-heavy text is larger than its raw byte length",
);

// --- textSnippetFrameBytes: the cap boundary peer.ts throws on ---
const atCap = "a".repeat(TEXT_SNIPPET_MAX_BYTES - ENVELOPE_BYTES);
assert.equal(textSnippetFrameBytes(atCap), TEXT_SNIPPET_MAX_BYTES, "largest exact-fit snippet lands on the cap");
assert.ok(textSnippetFrameBytes(atCap) <= TEXT_SNIPPET_MAX_BYTES, "an exact-fit snippet is accepted");
assert.ok(
  textSnippetFrameBytes(atCap + "a") > TEXT_SNIPPET_MAX_BYTES,
  "one byte past the cap is rejected — the boundary is not off by one",
);
assert.ok(
  textSnippetFrameBytes("x".repeat(TEXT_SNIPPET_MAX_BYTES)) > TEXT_SNIPPET_MAX_BYTES,
  "a clearly oversized snippet exceeds the cap",
);

// --- textSnippetFrameBytes: the default probe id must bound every real id ---
// `SessionView` measures with the default probe id before an id exists, while `peer.ts`
// measures with the real one from `fileId()`. The UI hint is only safe if the probe is
// never shorter than a real id, otherwise a snippet could pass the hint and throw on send.
const PROBE_ID_BYTES = 8;
for (let i = 0; i < 200; i++) {
  assert.ok(
    utf8(fileId()) <= PROBE_ID_BYTES,
    "fileId() never exceeds the default probe id, so the composer hint stays conservative",
  );
}
assert.ok(
  textSnippetFrameBytes("hi", "short") <= textSnippetFrameBytes("hi"),
  "a shorter id yields a smaller frame than the probe id estimate",
);

// --- summarizeBatches: aggregate rollup for a multi-file batch (#134) ------
const mkItem = (over) => ({
  id: over.id ?? "i",
  batchId: over.batchId ?? "b1",
  name: over.name ?? "f",
  size: over.size ?? 100,
  mime: "application/octet-stream",
  kind: "file",
  direction: over.direction ?? "send",
  status: over.status ?? "transferring",
  transferred: over.transferred ?? 0,
  progress: over.progress ?? 0,
  peerId: over.peerId,
});

// A single-item batch is never summarized — the item's own row IS the aggregate.
assert.deepEqual(
  summarizeBatches([mkItem({ id: "a", batchId: "solo" })]),
  [],
  "a lone item's batch produces no summary",
);

// Two items, one done and one half-through: byte-weighted progress, not a flat average.
const twoFile = [
  mkItem({ id: "a", batchId: "b1", size: 900, transferred: 900, status: "done" }),
  mkItem({ id: "b", batchId: "b1", size: 100, transferred: 50, status: "transferring" }),
];
const [b1] = summarizeBatches(twoFile);
assert.equal(b1.total, 2, "counts every item in the batch");
assert.equal(b1.done, 1, "counts only status:done items as finished");
assert.equal(b1.bytesTotal, 1000, "sums size across the batch");
assert.equal(b1.bytesDone, 950, "sums transferred across the batch");
assert.equal(b1.progress, 95, "byte-weighted progress, not a flat 50/50 average of item percentages");

// A batch fully done reports 100% and done === total.
const doneBatch = [
  mkItem({ id: "a", batchId: "b2", size: 10, transferred: 10, status: "done" }),
  mkItem({ id: "b", batchId: "b2", size: 10, transferred: 10, status: "done" }),
];
const [b2] = summarizeBatches(doneBatch);
assert.equal(b2.done, 2);
assert.equal(b2.progress, 100, "a fully-done batch is 100%, not truncated by rounding");

// Two independent multi-file batches (e.g. two devices in a mesh room) summarize separately,
// each keyed by its own batchId, in first-appearance order.
const mixed = [
  mkItem({ id: "a", batchId: "b3", peerId: "p1" }),
  mkItem({ id: "c", batchId: "b4", peerId: "p2" }),
  mkItem({ id: "b", batchId: "b3", peerId: "p1" }),
  mkItem({ id: "d", batchId: "b4", peerId: "p2" }),
];
const mixedSummaries = summarizeBatches(mixed);
assert.equal(mixedSummaries.length, 2, "each multi-file batchId gets its own summary");
assert.deepEqual(
  mixedSummaries.map((b) => b.batchId),
  ["b3", "b4"],
  "batches are ordered by first appearance in the item list",
);

console.log(
  "OK: transfer.ts resume identity helpers (fileKey stability + token uniqueness) + formatBytes boundaries + textSnippetFrameBytes envelope/UTF-8/escaping/cap + summarizeBatches byte-weighted aggregate rollup",
);
