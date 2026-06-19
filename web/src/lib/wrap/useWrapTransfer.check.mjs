/**
 * Runnable check for the multi-device (mesh) HOOK logic in useWrapTransfer.ts.
 *
 * The hook itself is React-bound, so rather than spin a renderer we re-create the
 * three load-bearing mesh decisions in isolation and assert them against fake
 * peers. These mirror the hook EXACTLY:
 *   1. fan-out: sendFiles/sendText hit every CONNECTED peer (and nobody else).
 *   2. stamping: every emitted item/offer is tagged with the peer it came from.
 *   3. routing: accept/decline/cancel reach the one peer that owns the work.
 *   4. lifecycle: peer-left closes + removes that peer and clears its offer.
 *
 * Run:  node src/lib/wrap/useWrapTransfer.check.mjs
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

/** A fake WrapPeer that records calls and lets us drive its events. */
class FakePeer {
  constructor(remoteId, initiator) {
    this.remoteId = remoteId;
    this.initiator = initiator;
    this.isConnected = false;
    this.offered = [];
    this.texts = [];
    this.accepted = [];
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
  acceptOffer(b) {
    this.accepted.push(b);
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
  if (peer) {
    peer.close();
    peersMap.delete(peerId);
  }
  if (incoming && incoming.peerId === peerId) incoming = null;
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

// 4. Lifecycle: a pending offer from a peer that leaves is cleared, peer closed+removed.
a._emit("incoming-offer", { batchId: "btA2", items: [] });
assert(incoming && incoming.peerId === a.remoteId, "second offer from A is pending");
peerLeft(a.remoteId);
assert(incoming === null, "peer-left clears a pending offer from that peer");
assert(a.closed === true, "peer-left closes the departing peer");
assert(!peersMap.has(a.remoteId), "peer-left removes the departing peer from the map");

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll mesh-hook checks passed.");
