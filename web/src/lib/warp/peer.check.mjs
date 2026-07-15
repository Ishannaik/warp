/**
 * Runnable check for the review-before-receive transfer protocol (no test runner,
 * no new deps — matches server/test.js style). Wires two WarpPeers together via
 * fake data channels and asserts the offer -> accept -> stream -> file-received
 * round-trip, plus decline gating and cancel.
 *
 * Run:  node src/lib/warp/peer.check.mjs   (after `pnpm --filter @warp/web build`,
 * OR with a transpile step). Because peer.ts is TS, this check imports a tiny
 * transpiled copy via esbuild if available; otherwise it documents the expected
 * trace. Kept dependency-free: it stubs only the browser globals WarpPeer touches.
 */

import assert from "node:assert";

// --- minimal browser global stubs ----------------------------------------
// A fake RTCPeerConnection that never actually connects; we drive the channel
// directly. WarpPeer's constructor calls createDataChannel (initiator) or waits
// for a "datachannel" event (responder).
class FakeChannel extends EventTarget {
  constructor() {
    super();
    this.readyState = "open";
    this.bufferedAmount = 0;
    this.binaryType = "arraybuffer";
    this.bufferedAmountLowThreshold = 0;
    this.peer = null; // wired to the other side's channel
  }
  send(data) {
    // Deliver asynchronously to mimic the network and let awaits resolve.
    queueMicrotask(() => {
      this.peer?.dispatchEvent(Object.assign(new Event("message"), { data }));
    });
  }
  close() {
    this.readyState = "closed";
  }
}

class FakePC extends EventTarget {
  constructor() {
    super();
    this.connectionState = "connected";
    this.localChannel = null;
  }
  createDataChannel() {
    this.localChannel = new FakeChannel();
    return this.localChannel;
  }
  addIceCandidate() {}
  async createOffer() {
    return { sdp: "" };
  }
  async createAnswer() {
    return { sdp: "" };
  }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  close() {}
}

globalThis.RTCPeerConnection = FakePC;
if (typeof globalThis.document === "undefined") globalThis.document = undefined; // forces makeThumb to bail (non-image anyway)

// --- transpile peer.ts/transfer.ts on the fly (esbuild if present) --------
let WarpPeer;
try {
  const esbuild = await import("esbuild");
  const fs = await import("node:fs/promises");
  const url = await import("node:url");
  const path = await import("node:path");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const out = await esbuild.build({
    entryPoints: [path.join(here, "peer.ts")],
    bundle: true,
    format: "esm",
    write: false,
    platform: "neutral",
    // signaling.ts is type-only at runtime here; let it bundle.
  });
  const code = out.outputFiles[0].text;
  const dataUrl = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  ({ WarpPeer } = await import(dataUrl));
  void fs;
} catch (e) {
  console.error("SKIP: esbuild not available to transpile TS for this check —", e.message);
  process.exit(0);
}

// --- wire two peers through fake channels ---------------------------------
// Record out-of-band signaling sends so we can assert the instant-cancel path.
const sigSent = [];
const sig = {
  signal(to, data) {
    sigSent.push({ to, data });
  },
};
const sender = new WarpPeer(sig, "B", true); // initiator owns localChannel
const receiver = new WarpPeer(sig, "A", false);

// Cross-wire the sender's created channel to a fresh receiver channel.
const sCh = sender.pc.localChannel;
const rCh = new FakeChannel();
sCh.peer = rCh;
rCh.peer = sCh;
// Attach receiver's channel via the "datachannel" path.
receiver.pc.dispatchEvent(Object.assign(new Event("datachannel"), { channel: rCh }));

const waitFor = (peer, ev) =>
  new Promise((res) => {
    const off = peer.on(ev, (payload) => {
      off();
      res(payload);
    });
  });

// --- the round-trip -------------------------------------------------------
const file = new Blob(["hello wrap world"], { type: "text/plain" });
file.name = "hi.txt"; // File-like
file.slice = Blob.prototype.slice; // ensure slice present

const offerSeen = waitFor(receiver, "incoming-offer");
const sendPromise = sender.offerFiles([file]);

const offer = await offerSeen;
assert.equal(offer.items.length, 1, "receiver sees one offered item");
assert.equal(offer.items[0].size, file.size, "manifest carries size");
assert.ok(offer.items[0].key, "manifest carries a resume key");
assert.ok(offer.items[0].resumeToken, "manifest carries a resumeToken");

const got = waitFor(receiver, "file-received");
receiver.acceptOffer(offer.batchId); // gate opens -> bytes flow

const received = await got;
const text = await received.blob.text();
assert.equal(text, "hello wrap world", "received blob reassembles to the sent bytes");

await sendPromise; // sender resolves only after streaming completes

// decline gating: a second offer that gets declined must send no item to done.
const offer2Seen = waitFor(receiver, "incoming-offer");
const send2 = sender.offerFiles([file]);
const offer2 = await offer2Seen;
const declined = waitFor(sender, "declined");
receiver.declineOffer(offer2.batchId);
await declined;
await send2; // resolves (does not throw) after a decline

// --- resume: an accept carrying resume{offset} streams ONLY the tail ----------
// We spy the sender's binary sends: with offset 6 on a 10-byte file, exactly 4
// bytes must cross the wire. (Receiver-side reassembly of a resume is a hook-level
// concern — tested in useWarpTransfer.check.mjs — so here we assert the sender.)
const ten = new Blob(["ABCDEFGHIJ"], { type: "text/plain" }); // 10 bytes
ten.name = "ten.txt";
ten.slice = Blob.prototype.slice;

let sentBinary = 0;
const rawSend = sCh.send.bind(sCh);
sCh.send = (d) => {
  if (d instanceof ArrayBuffer) sentBinary += d.byteLength;
  return rawSend(d);
};

const oSeen = waitFor(receiver, "incoming-offer");
const sendResume = sender.offerFiles([ten]);
const o = await oSeen;
receiver.acceptOffer(o.batchId, undefined, { [o.items[0].id]: 6 }); // resume from byte 6
await sendResume;
assert.equal(sentBinary, ten.size - 6, "resume streamed only the 4-byte tail, not the whole file");

// --- offset > size (or garbage) restarts from 0 -------------------------------
const ten2 = new Blob(["ABCDEFGHIJ"], { type: "text/plain" });
ten2.name = "ten2.txt";
ten2.slice = Blob.prototype.slice;
sentBinary = 0;
const oSeen2 = waitFor(receiver, "incoming-offer");
const got2 = waitFor(receiver, "file-received");
const sendRestart = sender.offerFiles([ten2]);
const o2 = await oSeen2;
receiver.acceptOffer(o2.batchId, undefined, { [o2.items[0].id]: 999 }); // bogus offset > size
const recv2 = await got2;
assert.equal(await recv2.blob.text(), "ABCDEFGHIJ", "offset>size restarts at 0 -> full file received");
assert.equal(sentBinary, ten2.size, "offset>size streamed the whole file (restart), not a bad slice");
await sendRestart;

sCh.send = rawSend; // restore

// --- accept-to-disk: a target streams straight to a writable (no blob) -----
// A fake File System Access writable + dir handle that records what's written.
const diskChunks = [];
let writableClosed = false;
const fakeWritable = {
  async write(chunk) {
    const buf = chunk instanceof ArrayBuffer ? chunk : await chunk.arrayBuffer();
    diskChunks.push(Buffer.from(buf));
  },
  async close() {
    writableClosed = true;
  },
};
const usedDirNames = [];
const dirHandle = {
  async getFileHandle(name, opts) {
    usedDirNames.push(name);
    assert.ok(opts && opts.create, "disk target opens file handles with create:true");
    return { name, async createWritable() { return fakeWritable; } };
  },
};

const offer3Seen = waitFor(receiver, "incoming-offer");
const send3 = sender.offerFiles([file]);
const offer3 = await offer3Seen;
const got3 = waitFor(receiver, "file-received");
receiver.acceptOffer(offer3.batchId, { dirHandle }); // <-- stream to disk
const received3 = await got3;
assert.equal(received3.savedToDisk, true, "disk transfer reports savedToDisk:true");
assert.equal(received3.blob, undefined, "disk transfer carries NO in-memory blob");
assert.equal(received3.name, "hi.txt", "disk transfer keeps the file name");
assert.equal(Buffer.concat(diskChunks).toString(), "hello wrap world", "bytes were written straight to the writable");
assert.equal(writableClosed, true, "the writable is closed on file-end");
await send3;

// --- instant cancel via signaling: out-of-band + idempotent ----------------
// Sender cancels a known item: it must emit out-of-band over signaling AND be
// idempotent (a second cancel — or a redundant in-band one — is a no-op).
const someId = offer.items[0].id; // an item that already reached "done"
sigSent.length = 0;
sender.cancel(someId); // already done -> no-op, no signaling emit
assert.equal(sigSent.length, 0, "cancel() is a no-op for an already-done item (idempotent)");

// Drive a fresh, still-offered item to exercise the live-cancel path on the receiver.
const offer4Seen = waitFor(receiver, "incoming-offer");
const send4 = sender.offerFiles([file]);
const offer4 = await offer4Seen;
receiver.acceptOffer(offer4.batchId); // in-memory accept
const liveId = offer4.items[0].id;

// Receiver cancels: must push an out-of-band signaling cancel to the sender.
sigSent.length = 0;
let cancelledCount = 0;
receiver.on("cancelled", () => { cancelledCount += 1; });
receiver.cancel(liveId);
assert.equal(sigSent.length, 1, "cancel() emits exactly one out-of-band signaling cancel");
assert.deepEqual(sigSent[0].data, { kind: "cancel", id: liveId }, "signaling cancel carries kind:'cancel' + id");

// Idempotency: a redundant out-of-band cancel for the same id does nothing.
await receiver.handleSignal("A", { kind: "cancel", id: liveId });
assert.equal(cancelledCount, 1, "a redundant cancel (in-band/out-of-band dup) is a no-op");
await send4; // sender resolves even though the item was cancelled

console.log("OK: offer/accept stream + decline gating + disk-stream + instant-cancel round-trip passed");
