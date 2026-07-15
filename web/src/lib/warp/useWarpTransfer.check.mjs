/**
 * Runnable check for the multi-device (mesh) HOOK logic in useWarpTransfer.ts.
 *
 * The hook itself is React-bound, so rather than spin a renderer we re-create the
 * three load-bearing mesh decisions in isolation and assert them against fake
 * peers. These mirror the hook EXACTLY:
 *   1. fan-out: sendFiles/sendText hit every CONNECTED peer (and nobody else).
 *   2. stamping: every emitted item/offer is tagged with the peer it came from.
 *   3. routing: accept/decline/cancel reach the one peer that owns the work.
 *   4. lifecycle: peer-left KEEPS a peer whose data channel is still open
 *      (signaling is only the handshake plane) and removes a dead one; a
 *      transport death mid-batch is SALVAGED: unfinished send files re-staged
 *      for the automatic re-offer, dead tray rows dropped, pending offer cleared.
 *   5. accept-strategy: a LARGE offer (>=256 MiB total or any single file) picks
 *      the disk-stream path (picker prompted, AcceptTarget passed to the peer); a
 *      SMALL offer stays in-memory (no picker, no target). A cancelled picker on
 *      a large offer falls back to in-memory.
 *
 * Run:  node src/lib/warp/useWarpTransfer.check.mjs
 */

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok  :", msg);
  }
}

/** A fake WarpPeer that records calls and lets us drive its events. */
class FakePeer {
  constructor(remoteId, initiator) {
    this.remoteId = remoteId;
    this.initiator = initiator;
    this.isConnected = false;
    this.offered = [];
    this.texts = [];
    this.accepted = [];
    this.acceptTargets = [];
    this.declined = [];
    this.cancelled = [];
    this.closed = false;
    this._listeners = {};
  }
  on(ev, fn) {
    (this._listeners[ev] ??= new Set()).add(fn);
    return () => this._listeners[ev].delete(fn);
  }
  _emit(ev, ...args) {
    for (const fn of this._listeners[ev] ?? []) fn(...args);
  }
  async offerFiles(files) {
    this.offered.push(files);
  }
  sendText(t) {
    this.texts.push(t);
  }
  acceptOffer(b, target) {
    this.accepted.push(b);
    this.acceptTargets.push(target); // undefined => in-memory; object => disk-stream
  }
  declineOffer(b) {
    this.declined.push(b);
  }
  cancel(id) {
    this.cancelled.push(id);
  }
  close() {
    this.closed = true;
  }
}

// ---- The hook's pure mesh helpers, reproduced 1:1 -----------------------------

const peersMap = new Map();
let items = [];
let incoming = null;

function bind(peerId, peer) {
  peer.on("transfer", (item) => {
    const stamped = { ...item, peerId };
    const idx = items.findIndex((t) => t.id === stamped.id);
    if (idx === -1) items.push(stamped);
    else items[idx] = stamped;
  });
  peer.on("incoming-offer", (info) => {
    incoming = { ...info, peerId };
  });
}

function connectedPeers() {
  return Array.from(peersMap.values()).filter((p) => p.isConnected);
}

async function sendFiles(files) {
  const open = connectedPeers();
  await Promise.all(open.map((p) => p.offerFiles(files)));
}

function sendText(text) {
  for (const p of connectedPeers()) p.sendText(text);
}

function accept() {
  if (!incoming) return;
  const off = incoming;
  incoming = null;
  peersMap.get(off.peerId)?.acceptOffer(off.batchId);
}

// ---- accept-strategy (large -> disk, small -> memory), reproduced 1:1 ---------

const LARGE_THRESHOLD = 256 * 1024 * 1024;

/**
 * Stubbable File System Access pickers. `fsPickers.mode` drives them:
 *   "ok"     -> resolve a fake dir/file handle (user chose a location)
 *   "cancel" -> reject like a dismissed picker (AbortError)
 *   "none"   -> the picker is absent (unsupported browser)
 */
const fsPickers = { mode: "ok", dirCalls: 0, fileCalls: 0, lastSuggested: undefined };
function fsWindow() {
  const w = {};
  if (fsPickers.mode !== "none") {
    w.showDirectoryPicker = async () => {
      fsPickers.dirCalls += 1;
      if (fsPickers.mode === "cancel") throw new Error("AbortError");
      return { getFileHandle: async () => ({ name: "x", createWritable: async () => ({}) }) };
    };
    w.showSaveFilePicker = async (opts) => {
      fsPickers.fileCalls += 1;
      fsPickers.lastSuggested = opts?.suggestedName;
      if (fsPickers.mode === "cancel") throw new Error("AbortError");
      return { name: opts?.suggestedName ?? "x", createWritable: async () => ({}) };
    };
  }
  return w;
}

/** The hook's accept() strategy logic, mirrored exactly against the stub picker. */
async function acceptWithStrategy() {
  if (!incoming) return;
  const off = incoming;
  const peer = peersMap.get(off.peerId);
  if (!peer) {
    incoming = null;
    return;
  }
  const total = off.items.reduce((s, it) => s + it.size, 0);
  const biggest = off.items.reduce((m, it) => Math.max(m, it.size), 0);
  const large = total >= LARGE_THRESHOLD || biggest >= LARGE_THRESHOLD;
  const fs = fsWindow();
  const canStream = large && (off.items.length > 1 ? !!fs.showDirectoryPicker : !!fs.showSaveFilePicker);

  let target;
  if (canStream) {
    try {
      if (off.items.length > 1) {
        target = { dirHandle: await fs.showDirectoryPicker() };
      } else {
        target = { fileHandle: await fs.showSaveFilePicker({ suggestedName: off.items[0]?.name }) };
      }
    } catch {
      target = undefined;
    }
  }
  incoming = null;
  peer.acceptOffer(off.batchId, target);
}

function cancel(id) {
  const item = items.find((t) => t.id === id);
  const peer = item?.peerId ? peersMap.get(item.peerId) : undefined;
  if (peer) {
    peer.cancel(id);
    return;
  }
  for (const p of peersMap.values()) p.cancel(id);
}

function peerLeft(peerId) {
  const peer = peersMap.get(peerId);
  // Keep a peer whose channel is open: a signaling blip must not kill a live
  // transfer. Only a dead peer is torn down here.
  if (peer && !peer.isConnected) {
    peer.close();
    peersMap.delete(peerId);
    if (incoming && incoming.peerId === peerId) incoming = null;
  }
}

// ---- the hook's salvage logic (mid-session transport death), mirrored 1:1 -----

const allFiles = [];
let pendingFiles = null;

function salvage(peerId) {
  const peer = peersMap.get(peerId);
  if (peer) {
    peer.close();
    peersMap.delete(peerId);
  }
  if (incoming && incoming.peerId === peerId) incoming = null;

  const unfinished = items.filter(
    (t) =>
      t.peerId === peerId &&
      t.kind === "file" &&
      t.status !== "done" &&
      t.status !== "declined" &&
      t.status !== "cancelled",
  );
  const pool = [...allFiles];
  const files = [];
  for (const t of unfinished) {
    if (t.direction !== "send") continue;
    const i = pool.findIndex((f) => f.name === t.name && f.size === t.size);
    if (i !== -1) files.push(pool.splice(i, 1)[0]);
  }
  if (files.length) pendingFiles = files;

  const gone = new Set(unfinished.map((t) => t.id));
  items = items.filter((t) => !gone.has(t.id));
}

// ---- scenario -----------------------------------------------------------------

const a = new FakePeer("aaaaaaaa11", true);
const b = new FakePeer("bbbbbbbb22", true);
const c = new FakePeer("cccccccc33", false); // never connects
peersMap.set(a.remoteId, a);
peersMap.set(b.remoteId, b);
peersMap.set(c.remoteId, c);
bind(a.remoteId, a);
bind(b.remoteId, b);
bind(c.remoteId, c);

a.isConnected = true;
b.isConnected = true;
// c stays disconnected.

// 1. Fan-out: sendFiles offers to A and B only (not the unconnected C).
const files = [{ name: "x.bin" }];
await sendFiles(files);
assert(a.offered.length === 1 && b.offered.length === 1, "sendFiles fans out to every connected peer");
assert(c.offered.length === 0, "sendFiles skips unconnected peers");

// sendText fans out the same way.
sendText("hi");
assert(a.texts.length === 1 && b.texts.length === 1 && c.texts.length === 0, "sendText fans out to connected peers only");

// 2. Stamping: an item emitted by B carries peerId === B.
b._emit("transfer", { id: "f1", batchId: "btB", name: "x.bin", direction: "send", status: "transferring" });
const f1 = items.find((t) => t.id === "f1");
assert(f1 && f1.peerId === b.remoteId, "emitted item is stamped with its source peerId");

// An incoming offer from A is tagged with A's id.
a._emit("incoming-offer", { batchId: "btA", items: [{ id: "f1", name: "x.bin", size: 1, mime: "application/octet-stream" }] });
assert(incoming && incoming.peerId === a.remoteId, "incoming offer is tagged with the source peerId");

// 3. Routing: accept() reaches A (the offer's owner), not B.
accept();
assert(a.accepted.length === 1 && a.accepted[0] === "btA", "accept routes to the offering peer");
assert(b.accepted.length === 0, "accept does not touch other peers");

// cancel(id) routes to the peer that owns the item (B owns f1).
cancel("f1");
assert(b.cancelled.length === 1 && b.cancelled[0] === "f1", "cancel routes to the item's owning peer");
assert(a.cancelled.length === 0 && c.cancelled.length === 0, "cancel does not touch unrelated peers");

// 4. Lifecycle: peer-left keeps a LIVE peer (open channel) and removes a dead one.
a._emit("incoming-offer", { batchId: "btA2", items: [] });
assert(incoming && incoming.peerId === a.remoteId, "second offer from A is pending");
peerLeft(a.remoteId); // A's channel is still open -> signaling blip, keep it
assert(peersMap.has(a.remoteId) && a.closed === false, "peer-left KEEPS a peer with a live channel");
assert(incoming && incoming.peerId === a.remoteId, "a live peer's pending offer survives peer-left");
peerLeft(c.remoteId); // C never connected -> dead, remove it
assert(c.closed === true && !peersMap.has(c.remoteId), "peer-left removes a peer without a live channel");

// 4b. Salvage: A's transport dies mid-batch -> peer torn down, unfinished send
//     files re-staged for the automatic re-offer, dead rows dropped, offer cleared.
allFiles.push({ name: "x.bin", size: 5 }, { name: "y.bin", size: 7 });
items.push(
  { id: "s-done", peerId: a.remoteId, kind: "file", direction: "send", status: "done", name: "y.bin", size: 7 },
  { id: "s-half", peerId: a.remoteId, kind: "file", direction: "send", status: "transferring", name: "x.bin", size: 5 },
  { id: "r-half", peerId: a.remoteId, kind: "file", direction: "receive", status: "transferring", name: "z.bin", size: 9 },
);
salvage(a.remoteId);
assert(a.closed === true && !peersMap.has(a.remoteId), "salvage closes + removes the dead peer");
assert(incoming === null, "salvage clears a pending offer from the dead peer");
assert(
  pendingFiles && pendingFiles.length === 1 && pendingFiles[0].name === "x.bin",
  "salvage re-stages ONLY unfinished send files (matched by name+size)",
);
assert(items.some((t) => t.id === "s-done"), "salvage keeps completed rows");
assert(
  !items.some((t) => t.id === "s-half") && !items.some((t) => t.id === "r-half"),
  "salvage drops unfinished rows (the automatic re-offer recreates them)",
);

// 5. Accept-strategy: large vs small offers choose disk vs memory. ---------------
const MB = 1024 * 1024;

/** Drive acceptWithStrategy() for one offer and return the target the peer got. */
async function runAccept(peerId, offerItems, pickerMode) {
  fsPickers.mode = pickerMode;
  fsPickers.dirCalls = 0;
  fsPickers.fileCalls = 0;
  incoming = { batchId: `b-${peerId}`, peerId, items: offerItems };
  await acceptWithStrategy();
  const peer = peersMap.get(peerId);
  return peer.acceptTargets[peer.acceptTargets.length - 1];
}

// A fresh peer per sub-scenario so accept arrays don't bleed together.
const d = new FakePeer("dddddddd44", false);
const e = new FakePeer("eeeeeeee55", false);
const f = new FakePeer("ffffffff66", false);
const g = new FakePeer("gggggggg77", false);
const h = new FakePeer("hhhhhhhh88", false);
for (const p of [d, e, f, g, h]) peersMap.set(p.remoteId, p);

// 5a. Small single file -> in-memory (no target, no picker).
const tSmall = await runAccept(d.remoteId, [{ id: "s1", name: "a.txt", size: 10 * MB, mime: "text/plain" }], "ok");
assert(tSmall === undefined, "small single-file offer accepts in-memory (no AcceptTarget)");
assert(fsPickers.fileCalls === 0 && fsPickers.dirCalls === 0, "small offer does NOT prompt a save picker");

// 5b. Large SINGLE file -> disk via showSaveFilePicker -> { fileHandle }.
const tBigOne = await runAccept(e.remoteId, [{ id: "b1", name: "game.bin", size: 600 * MB, mime: "application/octet-stream" }], "ok");
assert(tBigOne && "fileHandle" in tBigOne, "large single file streams to disk via a file handle");
assert(fsPickers.fileCalls === 1 && fsPickers.dirCalls === 0, "large single file prompts showSaveFilePicker (not the dir picker)");
assert(fsPickers.lastSuggested === "game.bin", "save picker is seeded with the file's suggested name");

// 5c. Large MULTI-file batch (total >= threshold) -> disk via showDirectoryPicker -> { dirHandle }.
const tBigMany = await runAccept(
  f.remoteId,
  [
    { id: "m1", name: "p1.bin", size: 200 * MB, mime: "application/octet-stream" },
    { id: "m2", name: "p2.bin", size: 100 * MB, mime: "application/octet-stream" },
  ],
  "ok",
);
assert(tBigMany && "dirHandle" in tBigMany, "large multi-file batch streams to disk via a directory handle");
assert(fsPickers.dirCalls === 1 && fsPickers.fileCalls === 0, "large multi-file batch prompts showDirectoryPicker");

// 5d. Cancelled picker on a large offer -> in-memory fallback (no target).
const tCancel = await runAccept(g.remoteId, [{ id: "c1", name: "big.iso", size: 900 * MB, mime: "application/octet-stream" }], "cancel");
assert(tCancel === undefined, "a cancelled picker falls back to in-memory accept (no AcceptTarget)");
// The same offer was still accepted (one entry recorded), just without a target.
assert(g.accepted.length === 1, "cancelled picker still accepts the batch (in-memory)");

// 5e. Large offer but NO File System Access API -> in-memory fallback (no prompt).
const tNoApi = await runAccept(h.remoteId, [{ id: "n1", name: "huge.zip", size: 800 * MB, mime: "application/zip" }], "none");
assert(tNoApi === undefined, "large offer on a browser without the FS Access API accepts in-memory");
assert(fsPickers.fileCalls === 0 && fsPickers.dirCalls === 0, "no picker is prompted when the FS Access API is absent");

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll mesh-hook checks passed.");
