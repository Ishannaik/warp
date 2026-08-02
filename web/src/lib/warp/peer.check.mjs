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
    // A real channel delivers binary as an ArrayBuffer (binaryType) no matter
    // whether the sender passed an ArrayBuffer or a typed-array view — normalize
    // here so the receiver's `data instanceof ArrayBuffer` path is exercised.
    const wire = ArrayBuffer.isView(data)
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : data;
    // Deliver asynchronously to mimic the network and let awaits resolve.
    queueMicrotask(() => {
      this.peer?.dispatchEvent(Object.assign(new Event("message"), { data: wire }));
    });
  }
  close() {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
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

// text snippets stay inline, but oversized serialized frames must never hit send().
const TEXT_SNIPPET_MAX_BYTES = 64 * 1024;
const frameBytes = (id, text) => new TextEncoder().encode(JSON.stringify({ t: "text", id, text })).byteLength;
const frameRoomForText = (id) => TEXT_SNIPPET_MAX_BYTES - frameBytes(id, "");
const fixedRandom = () => 0.123456789;
const fixedTextId = fixedRandom().toString(36).slice(2, 10);
function withFixedIds(fn) {
  const savedRandom = Math.random;
  Math.random = fixedRandom;
  try {
    return fn();
  } finally {
    Math.random = savedRandom;
  }
}

let textSendTransfer = null;
const offTextTransfer = sender.on("transfer", (item) => {
  if (item.kind === "text" && item.direction === "send") textSendTransfer = item;
});
const textSeen = waitFor(receiver, "text-received");
const textFrames = [];
const rawTextSend = sCh.send.bind(sCh);
sCh.send = (d) => {
  if (typeof d === "string") {
    const msg = JSON.parse(d);
    if (msg.t === "text") textFrames.push(d);
  }
  return rawTextSend(d);
};
sender.sendText("short note");
const textReceived = await textSeen;
assert.equal(textReceived.text, "short note", "text snippets arrive over the data channel");
assert.equal(textSendTransfer?.size, new Blob(["short note"]).size, "text send item records byte size");
offTextTransfer();
assert.ok(
  new TextEncoder().encode(textFrames.at(-1)).byteLength <= TEXT_SNIPPET_MAX_BYTES,
  "normal text frame stays within the 64 KiB wire cap",
);

const boundarySeen = waitFor(receiver, "text-received");
const boundaryText = "x".repeat(frameRoomForText(fixedTextId));
withFixedIds(() => sender.sendText(boundaryText));
const boundaryReceived = await boundarySeen;
const boundaryFrame = textFrames.at(-1);
assert.equal(boundaryReceived.text.length, boundaryText.length, "boundary-size text is still delivered");
assert.equal(
  new TextEncoder().encode(boundaryFrame).byteLength,
  TEXT_SNIPPET_MAX_BYTES,
  "boundary-size text serializes to exactly the 64 KiB wire cap",
);
sCh.send = rawTextSend;

// Backslash-heavy text can be raw-small but JSON-large; guard the serialized frame.
let oversizedSent = false;
let oversizedTransfer = false;
sCh.send = (d) => {
  oversizedSent = true;
  return rawTextSend(d);
};
const offOversizedTransfer = sender.on("transfer", (item) => {
  if (item.kind === "text") oversizedTransfer = true;
});
assert.throws(
  () => withFixedIds(() => sender.sendText("x".repeat(frameRoomForText(fixedTextId) + 1))),
  /text-too-large/,
  "one byte over the serialized frame cap is refused before sending",
);
assert.throws(
  () => sender.sendText("\\".repeat(Math.ceil(TEXT_SNIPPET_MAX_BYTES / 2))),
  /text-too-large/,
  "JSON-escaped text is capped by serialized frame bytes, not raw text bytes",
);
offOversizedTransfer();
sCh.send = rawTextSend;
assert.equal(oversizedSent, false, "oversized text does not call channel.send()");
assert.equal(oversizedTransfer, false, "oversized text does not create a transfer item");

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
  // The pump sends typed-array views into the read block (zero-copy); count
  // those alongside raw ArrayBuffers.
  if (d instanceof ArrayBuffer || ArrayBuffer.isView(d)) sentBinary += d.byteLength;
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

// --- channel closes while an offer is awaiting accept/decline -------------
// The public promise must reject promptly so useWarpTransfer's existing catch
// can stage the files for salvage/re-offer. A timeout is the historical bug.
const droppedSender = new WarpPeer(sig, "D", true);
const droppedReceiver = new WarpPeer(sig, "C", false);
const droppedSenderChannel = droppedSender.pc.localChannel;
const droppedReceiverChannel = new FakeChannel();
droppedSenderChannel.peer = droppedReceiverChannel;
droppedReceiverChannel.peer = droppedSenderChannel;
droppedReceiver.pc.dispatchEvent(
  Object.assign(new Event("datachannel"), { channel: droppedReceiverChannel }),
);

const droppedOfferSeen = waitFor(droppedReceiver, "incoming-offer");
const droppedOffer = droppedSender.offerFiles([file]);
await droppedOfferSeen; // proves the batch is registered and awaiting a response
droppedSenderChannel.close();
const droppedOutcome = await Promise.race([
  droppedOffer.then(
    () => ({ kind: "resolved" }),
    (reason) => ({ kind: "rejected", reason }),
  ),
  new Promise((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 100)),
]);
assert.equal(
  droppedOutcome.kind,
  "rejected",
  "offerFiles rejects instead of hanging when the channel closes before accept/decline",
);
assert.equal(droppedOutcome.reason?.message, "channel-closed", "channel closure stays distinct from decline");

async function checkPendingOfferTrigger(label, trigger) {
  const triggerSender = new WarpPeer(sig, `${label}-remote`, true);
  const triggerReceiver = new WarpPeer(sig, `${label}-local`, false);
  const triggerSenderChannel = triggerSender.pc.localChannel;
  const triggerReceiverChannel = new FakeChannel();
  triggerSenderChannel.peer = triggerReceiverChannel;
  triggerReceiverChannel.peer = triggerSenderChannel;
  triggerReceiver.pc.dispatchEvent(
    Object.assign(new Event("datachannel"), { channel: triggerReceiverChannel }),
  );
  const triggerOfferSeen = waitFor(triggerReceiver, "incoming-offer");
  const triggerOffer = triggerSender.offerFiles([file]);
  await triggerOfferSeen;
  trigger(triggerSender, triggerSenderChannel);
  const outcome = await Promise.race([
    triggerOffer.then(
      () => ({ kind: "resolved" }),
      (reason) => ({ kind: "rejected", reason }),
    ),
    new Promise((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 100)),
  ]);
  assert.equal(outcome.kind, "rejected", `${label} rejects a pending offer`);
  assert.equal(outcome.reason?.message, "channel-closed", `${label} uses channel-closed`);
}

await checkPendingOfferTrigger("channel error", (_peer, channel) => {
  channel.dispatchEvent(new Event("error"));
});
await checkPendingOfferTrigger("explicit close", (peer) => {
  peer.close();
});

// The channel can also die while an image thumbnail is being prepared, before
// the batch enters `outgoing`. Registration must notice that already-dead state
// instead of waiting for an error/close event that has already happened.
const savedDocument = globalThis.document;
const savedCreateImageBitmap = globalThis.createImageBitmap;
let thumbnailStarted;
const thumbnailStartedPromise = new Promise((resolve) => {
  thumbnailStarted = resolve;
});
let finishThumbnail;
globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} }),
      toDataURL: () => "data:image/jpeg;base64,AA==",
    };
  },
};
globalThis.createImageBitmap = async () => {
  thumbnailStarted();
  return await new Promise((resolve) => {
    finishThumbnail = () => resolve({ width: 1, height: 1, close() {} });
  });
};

const delayedSender = new WarpPeer(sig, "F", true);
const image = new Blob(["pixels"], { type: "image/png" });
image.name = "pixel.png";
image.slice = Blob.prototype.slice;
const delayedOffer = delayedSender.offerFiles([image]);
await thumbnailStartedPromise;
delayedSender.pc.localChannel.close();
finishThumbnail();
const delayedOutcome = await Promise.race([
  delayedOffer.then(
    () => ({ kind: "resolved" }),
    (reason) => ({ kind: "rejected", reason }),
  ),
  new Promise((resolve) => setTimeout(() => resolve({ kind: "timeout" }), 100)),
]);
globalThis.document = savedDocument;
globalThis.createImageBitmap = savedCreateImageBitmap;
assert.equal(
  delayedOutcome.kind,
  "rejected",
  "offerFiles rejects when the channel closes before pending-batch registration",
);
assert.equal(delayedOutcome.reason?.message, "channel-closed", "registration-time closure uses channel-closed");

// --- send-pump backpressure (SEND_HIGH_WATER) --------------------------------
//
// Every case above uses a FakeChannel whose bufferedAmount is ALWAYS 0, so the
// send pump's backpressure branch —
//     while (ch.bufferedAmount + sendChunk > SEND_HIGH_WATER) await waitForDrain(ch)
// — and waitForDrain's resolve-on-close/error recovery were never exercised. That
// branch is load-bearing: CLAUDE.md warns a high-water mark at/above the 16 MiB
// send-queue cap disables backpressure entirely and kills every large transfer
// mid-send. Pin the behaviour here with a channel that ACCUMULATES bufferedAmount
// on each binary send and only drains when we say so, mimicking a link slower than
// the sender.
const SEND_HIGH_WATER = 8 * 1024 * 1024; // mirrors peer.ts; keep in sync

class BackpressureChannel extends FakeChannel {
  constructor() {
    super();
    this.maxBuffered = 0; // high-water mark actually reached
    this.oversend = false; // set if a send ever pushed past the cap (it must not)
  }
  send(data) {
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const len = data.byteLength;
      // The pump guards with the SAME predicate before calling send(), so this must
      // never trip; if it does, backpressure failed to hold the buffer below the cap.
      if (this.bufferedAmount + len > SEND_HIGH_WATER) this.oversend = true;
      this.bufferedAmount += len;
      if (this.bufferedAmount > this.maxBuffered) this.maxBuffered = this.bufferedAmount;
    }
    super.send(data); // still deliver to the peer (control frames pass through too)
  }
  /** Drain the whole send queue and cross the low-water mark, waking a parked pump. */
  drainAll() {
    if (this.bufferedAmount > 0) {
      this.bufferedAmount = 0;
      this.dispatchEvent(new Event("bufferedamountlow"));
    }
  }
}
class BackpressurePC extends FakePC {
  createDataChannel() {
    this.localChannel = new BackpressureChannel();
    return this.localChannel;
  }
}
function makeBackpressurePair() {
  const saved = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = BackpressurePC; // only the sender's created channel backs up
  const s = new WarpPeer(sig, "bp-remote", true);
  globalThis.RTCPeerConnection = saved;
  const r = new WarpPeer(sig, "bp-local", false);
  const sCh = s.pc.localChannel;
  const rCh = new FakeChannel();
  sCh.peer = rCh;
  rCh.peer = sCh;
  r.pc.dispatchEvent(Object.assign(new Event("datachannel"), { channel: rCh }));
  return { s, r, sCh };
}
async function waitForCondition(fn, label, timeout = 3000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error(`timeout waiting for ${label}`);
    await new Promise((res) => setImmediate(res));
  }
}

// A file bigger than the high-water mark, so the pump MUST park and resume at least
// once. Deterministic content (byte i = i & 0xff) so we can verify reassembly.
const BIG_N = 9 * 1024 * 1024; // > SEND_HIGH_WATER (8 MiB)
const bigBytes = new Uint8Array(BIG_N);
for (let i = 0; i < BIG_N; i += 1) bigBytes[i] = i & 0xff;
const bigFile = new Blob([bigBytes], { type: "application/octet-stream" });
bigFile.name = "big.bin";
bigFile.slice = Blob.prototype.slice;

// (A) Pause + resume under backpressure, with byte-exact reassembly.
{
  const { s, r, sCh } = makeBackpressurePair();
  let bigDone = false;
  const offerSeen = waitFor(r, "incoming-offer");
  const sendP = s.offerFiles([bigFile]);
  const off = await offerSeen;
  const gotBig = waitFor(r, "file-received").then((payload) => {
    bigDone = true;
    return payload;
  });
  r.acceptOffer(off.batchId);

  // The link never drains on its own, so the pump fills the buffer to the cap and
  // PARKS on waitForDrain — it must not finish while parked.
  await waitForCondition(() => sCh.bufferedAmount >= SEND_HIGH_WATER, "backpressure to engage");
  assert.equal(bigDone, false, "a >high-water file does NOT complete while the send queue is full (pump paused)");
  assert.equal(sCh.oversend, false, "the pump never sends past the high-water mark");
  assert.ok(sCh.maxBuffered <= SEND_HIGH_WATER, "bufferedAmount is held at/below the cap, never toward the 16 MiB hard limit");

  // Drain in strides; each drain crosses the low-water mark and wakes the pump.
  const drainer = setInterval(() => sCh.drainAll(), 5);
  let recvBig;
  try {
    recvBig = await Promise.race([
      gotBig,
      new Promise((_, rej) => setTimeout(() => rej(new Error("transfer hung under backpressure")), 5000)),
    ]);
  } finally {
    clearInterval(drainer);
  }
  assert.equal(sCh.maxBuffered >= SEND_HIGH_WATER, true, "backpressure actually engaged (buffer reached the cap)");
  assert.equal(recvBig.blob.size, BIG_N, "the whole >high-water file arrived");
  const rb = new Uint8Array(await recvBig.blob.arrayBuffer());
  assert.equal(rb[0], 0, "reassembled byte 0 is correct");
  assert.equal(rb[4 * 1024 * 1024], (4 * 1024 * 1024) & 0xff, "a mid-file byte survived the pause/resume boundary");
  assert.equal(rb[BIG_N - 1], (BIG_N - 1) & 0xff, "the final byte is correct (no truncation/dup on resume)");
  await sendP;
}

// (B) The "frozen at 40%" regression: if the channel dies WHILE the pump is parked
// on backpressure, bufferedamountlow never fires — waitForDrain must still resolve
// (on close) so the send settles instead of hanging forever.
{
  const { s, r, sCh } = makeBackpressurePair();
  let lastStatus = null;
  const offerSeen = waitFor(r, "incoming-offer");
  const offTransfer = s.on("transfer", (item) => {
    if (item.direction === "send" && item.kind === "file") lastStatus = item.status;
  });
  const sendP = s.offerFiles([bigFile]);
  const off = await offerSeen;
  r.acceptOffer(off.batchId);
  await waitForCondition(() => sCh.bufferedAmount >= SEND_HIGH_WATER, "backpressure to engage (close case)");

  sCh.close(); // kill the channel while the pump is parked — no drain, no bufferedamountlow
  const outcome = await Promise.race([
    sendP.then(() => "settled"),
    new Promise((res) => setTimeout(() => res("hung"), 1000)),
  ]);
  offTransfer();
  assert.equal(outcome, "settled", "a channel close while parked on backpressure settles the send (no permanent hang)");
  assert.equal(lastStatus, "error", "a send that dies mid-backpressure is marked error for salvage, not left 'transferring'");
}

// --- optional compression (#130): negotiated, per-chunk, byte-exact -------------
// A compressible file accepted WITH an advertised codec must round-trip byte-exact
// AND provably shrink on the wire. Node ships gzip, so this drives the real
// CompressionStream path end to end. (Every case ABOVE accepts with NO codecs, so
// they stay on the raw path — this is the only compressed transfer in the harness.)
{
  const compSender = new WarpPeer(sig, "cmp-remote", true);
  const compReceiver = new WarpPeer(sig, "cmp-local", false);
  const compSenderCh = compSender.pc.localChannel;
  const compReceiverCh = new FakeChannel();
  compSenderCh.peer = compReceiverCh;
  compReceiverCh.peer = compSenderCh;
  compReceiver.pc.dispatchEvent(Object.assign(new Event("datachannel"), { channel: compReceiverCh }));

  // Highly compressible content, so the wire form is provably smaller than plaintext.
  const compText = "warp-compression ".repeat(4000); // ~68 KB, very repetitive
  const compFile = new Blob([compText], { type: "text/plain" });
  compFile.name = "compressible.txt";
  compFile.slice = Blob.prototype.slice;

  let beginCodec;
  let wireBinary = 0;
  const rawCompSend = compSenderCh.send.bind(compSenderCh);
  compSenderCh.send = (d) => {
    if (typeof d === "string") {
      const msg = JSON.parse(d);
      if (msg.t === "file-begin") beginCodec = msg.codec;
    } else if (d instanceof ArrayBuffer || ArrayBuffer.isView(d)) {
      wireBinary += d.byteLength;
    }
    return rawCompSend(d);
  };

  const compOfferSeen = waitFor(compReceiver, "incoming-offer");
  const compSend = compSender.offerFiles([compFile]);
  const compOffer = await compOfferSeen;
  const compGot = waitFor(compReceiver, "file-received");
  compReceiver.acceptOffer(compOffer.batchId, undefined, undefined, ["gzip"]); // advertise a codec
  const compReceived = await compGot;
  assert.equal(await compReceived.blob.text(), compText, "compressed transfer is byte-exact after decompression");
  assert.equal(beginCodec, "gzip", "file-begin names the negotiated codec");
  assert.ok(wireBinary > 0, "binary chunks crossed the wire");
  assert.ok(
    wireBinary < compFile.size,
    `compressed wire bytes (${wireBinary}) are fewer than plaintext (${compFile.size})`,
  );
  compSenderCh.send = rawCompSend;
  await compSend;

  // An incompressible MIME stays raw even when a codec is advertised: no codec is
  // named in file-begin, so the receiver takes the sync path and bytes are unchanged.
  const rawSender = new WarpPeer(sig, "raw-remote", true);
  const rawReceiver = new WarpPeer(sig, "raw-local", false);
  const rawSenderCh = rawSender.pc.localChannel;
  const rawReceiverCh = new FakeChannel();
  rawSenderCh.peer = rawReceiverCh;
  rawReceiverCh.peer = rawSenderCh;
  rawReceiver.pc.dispatchEvent(Object.assign(new Event("datachannel"), { channel: rawReceiverCh }));

  const pngBytes = new Uint8Array(2048);
  for (let i = 0; i < pngBytes.length; i += 1) pngBytes[i] = (i * 131 + 17) & 0xff;
  const pngFile = new Blob([pngBytes], { type: "image/png" }); // already compressed -> raw
  pngFile.name = "image.png";
  pngFile.slice = Blob.prototype.slice;

  let rawBeginCodec = "unset";
  const rawSpy = rawSenderCh.send.bind(rawSenderCh);
  rawSenderCh.send = (d) => {
    if (typeof d === "string") {
      const msg = JSON.parse(d);
      if (msg.t === "file-begin") rawBeginCodec = msg.codec;
    }
    return rawSpy(d);
  };
  const rawOfferSeen = waitFor(rawReceiver, "incoming-offer");
  const rawSend = rawSender.offerFiles([pngFile]);
  const rawOffer = await rawOfferSeen;
  const rawGot = waitFor(rawReceiver, "file-received");
  rawReceiver.acceptOffer(rawOffer.batchId, undefined, undefined, ["gzip"]);
  const rawReceived = await rawGot;
  assert.equal(rawBeginCodec, undefined, "an incompressible MIME is sent raw (no codec in file-begin)");
  assert.deepEqual(new Uint8Array(await rawReceived.blob.arrayBuffer()), pngBytes, "raw bytes pass through unchanged");
  rawSenderCh.send = rawSpy;
  await rawSend;
}

// --- piece manifest (#137): a corrupt piece triggers ONE targeted re-request ----
// A file in the manifest window gets a per-piece SHA-256 manifest in file-begin.
// We flip one byte of piece 2 in transit; the receiver must detect it against the
// manifest, re-request ONLY that index, and complete byte-exact from the re-send —
// never a full resend. This drives the real manifestFromFile + PieceVerifier +
// piece-request/piece round-trip end to end.
{
  const PIECE = 256 * 1024; // choosePieceSize floor; file below stays wire-aligned
  const N = 5 * PIECE; // 1.25 MiB -> 5 pieces, above the 1 MiB manifest floor
  const bytes = new Uint8Array(N);
  for (let i = 0; i < N; i += 1) bytes[i] = (i * 7 + 3) & 0xff;
  const mfile = new Blob([bytes], { type: "application/octet-stream" });
  mfile.name = "manifest.bin";
  mfile.slice = Blob.prototype.slice;

  const mSender = new WarpPeer(sig, "mani-remote", true);
  const mReceiver = new WarpPeer(sig, "mani-local", false);
  const mSenderCh = mSender.pc.localChannel;
  const mReceiverCh = new FakeChannel();
  mSenderCh.peer = mReceiverCh;
  mReceiverCh.peer = mSenderCh;
  mReceiver.pc.dispatchEvent(Object.assign(new Event("datachannel"), { channel: mReceiverCh }));

  // Spy the sender->receiver wire: capture the manifest, corrupt exactly one
  // FORWARD piece (index 2), and never corrupt the targeted re-send (the binary
  // that immediately follows a `piece` control frame).
  let manifest = null;
  let forwardBinaries = 0;
  let resendNext = false;
  let corrupted = 0;
  let senderBinaryBytes = 0;
  const CORRUPT_INDEX = 2;
  const mRawSend = mSenderCh.send.bind(mSenderCh);
  mSenderCh.send = (d) => {
    if (typeof d === "string") {
      const msg = JSON.parse(d);
      if (msg.t === "file-begin") manifest = msg.pieces ?? null;
      if (msg.t === "piece") resendNext = true; // the next binary is the re-send
      return mRawSend(d);
    }
    const len = d.byteLength;
    senderBinaryBytes += len;
    if (resendNext) {
      resendNext = false; // deliver the re-sent piece intact
      return mRawSend(d);
    }
    const idx = forwardBinaries += 1;
    if (idx - 1 === CORRUPT_INDEX) {
      const src = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d);
      const bad = new Uint8Array(src); // copy — don't mutate the sender's read block
      bad[10] ^= 0xff;
      corrupted += 1;
      return mRawSend(bad.buffer);
    }
    return mRawSend(d);
  };

  // Count the receiver's targeted re-requests.
  let pieceRequests = 0;
  let requestedIndex = -1;
  const mRawRSend = mReceiverCh.send.bind(mReceiverCh);
  mReceiverCh.send = (d) => {
    if (typeof d === "string") {
      const msg = JSON.parse(d);
      if (msg.t === "piece-request") {
        pieceRequests += 1;
        requestedIndex = msg.index;
      }
    }
    return mRawRSend(d);
  };

  const mOfferSeen = waitFor(mReceiver, "incoming-offer");
  const mSendP = mSender.offerFiles([mfile]);
  const mOffer = await mOfferSeen;
  const mGot = waitFor(mReceiver, "file-received");
  mReceiver.acceptOffer(mOffer.batchId);

  const mReceived = await Promise.race([
    mGot,
    new Promise((_, rej) => setTimeout(() => rej(new Error("manifest transfer hung")), 5000)),
  ]);

  // The manifest rode in file-begin: one hash per piece at the wire-aligned size.
  assert.ok(manifest, "file-begin carries a piece manifest for a file in the size window");
  assert.equal(manifest.pieceSize, PIECE, "the manifest uses the 256 KiB wire-aligned piece size");
  assert.equal(manifest.hashes.length, 5, "a 1.25 MiB file is 5 pieces");
  assert.equal(manifest.size, N, "the manifest records the full file size");

  // Exactly one corrupt piece, exactly one targeted re-request of THAT index.
  assert.equal(corrupted, 1, "the harness corrupted exactly one forward piece");
  assert.equal(pieceRequests, 1, "the receiver re-requested exactly one piece (not a full resend)");
  assert.equal(requestedIndex, CORRUPT_INDEX, "the re-request named the corrupt piece index");

  // Byte-exact completion: the bad piece was replaced by the clean re-send.
  assert.equal(mReceived.blob.size, N, "the whole file arrived");
  assert.deepEqual(new Uint8Array(await mReceived.blob.arrayBuffer()), bytes, "reassembled bytes are byte-exact after the targeted re-request");

  // No full resend: forward stream (N) + exactly one re-sent piece (PIECE).
  assert.equal(senderBinaryBytes, N + PIECE, "only the single corrupt piece was re-sent, not the whole file");

  mSenderCh.send = mRawSend;
  mReceiverCh.send = mRawRSend;
  await mSendP;
}

// --- resumed receive verifies its tail (#171 / research P5) ---------------------
// A resumed receive used to fall back to the legacy trust-the-stream path for its
// ENTIRE tail (the sender only sent a manifest at offset 0, the receiver only built
// a verifier at offset 0). Now the sender caches the manifest from a fresh send and
// re-includes it on a resumed file-begin, and the receiver seeds a verifier at the
// piece boundary, so a corrupt tail piece is re-requested by index, not trusted.
{
  const PIECE = 256 * 1024;
  const N = 5 * PIECE; // 1.25 MiB -> 5 pieces
  const bytes = new Uint8Array(N);
  for (let i = 0; i < N; i += 1) bytes[i] = (i * 13 + 5) & 0xff;
  const rfile = new Blob([bytes], { type: "application/octet-stream" });
  rfile.name = "resume.bin";
  rfile.slice = Blob.prototype.slice;

  const RESUME = 2 * PIECE; // piece-aligned resume offset (2 pieces in, 3-piece tail)
  let prefix = new Uint8Array(0); // offer 1 is fresh; swapped to the partial for offer 2

  // A sink that already holds `prefix` (the durable bytes a resumed receive has),
  // appends the verified tail, and finalizes to prefix+tail — mirroring what the
  // hook reconstructs over a durable partial (#36/#169), at the engine seam.
  const prefixSink = (pre) => {
    const chunks = [];
    let n = pre.byteLength;
    return {
      get bytesWritten() {
        return n;
      },
      get failed() {
        return false;
      },
      append(buf) {
        chunks.push(new Uint8Array(buf));
        n += buf.byteLength;
      },
      async quiesce() {},
      async finalize() {
        const out = new Uint8Array(n);
        out.set(pre, 0);
        let off = pre.byteLength;
        for (const c of chunks) {
          out.set(c, off);
          off += c.byteLength;
        }
        return new Blob([out]);
      },
      async abort() {
        chunks.length = 0;
      },
    };
  };
  let liveSink = null;
  const host = {
    begin() {
      liveSink = prefixSink(prefix);
      return liveSink;
    },
    get() {
      return liveSink;
    },
    savedName() {
      return undefined;
    },
    end() {},
  };

  const rSender = new WarpPeer(sig, "res-remote", true);
  const rReceiver = new WarpPeer(sig, "res-local", false, host);
  const rSenderCh = rSender.pc.localChannel;
  const rReceiverCh = new FakeChannel();
  rSenderCh.peer = rReceiverCh;
  rReceiverCh.peer = rSenderCh;
  rReceiver.pc.dispatchEvent(Object.assign(new Event("datachannel"), { channel: rReceiverCh }));

  // Wire spy: capture each file-begin's manifest; during offer 2 corrupt the FIRST
  // forward tail piece and deliver the targeted re-send intact.
  const begins = [];
  let armCorrupt = false;
  let resendNext = false;
  let corrupted = 0;
  let tailBinaries = 0;
  let offer2BinaryBytes = 0;
  const rawSSend = rSenderCh.send.bind(rSenderCh);
  rSenderCh.send = (d) => {
    if (typeof d === "string") {
      const msg = JSON.parse(d);
      if (msg.t === "file-begin") begins.push(msg.pieces ?? null);
      if (msg.t === "piece") resendNext = true; // the next binary is the re-send
      return rawSSend(d);
    }
    if (armCorrupt) offer2BinaryBytes += d.byteLength;
    if (resendNext) {
      resendNext = false; // deliver the re-sent piece intact
      return rawSSend(d);
    }
    if (armCorrupt) {
      tailBinaries += 1;
      if (tailBinaries === 1) {
        const src = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d);
        const bad = new Uint8Array(src); // copy — don't mutate the sender's block
        bad[20] ^= 0xff;
        corrupted += 1;
        return rawSSend(bad.buffer);
      }
    }
    return rawSSend(d);
  };
  let pieceRequests = 0;
  let requestedIndex = -1;
  const rawRSend = rReceiverCh.send.bind(rReceiverCh);
  rReceiverCh.send = (d) => {
    if (typeof d === "string") {
      const msg = JSON.parse(d);
      if (msg.t === "piece-request") {
        pieceRequests += 1;
        requestedIndex = msg.index;
      }
    }
    return rawRSend(d);
  };

  // Offer 1: FRESH (offset 0). Computes + caches the manifest in the sender and
  // verifies the whole file on the receiver — also proving the #171 changes don't
  // regress the fresh manifest path.
  const o1Seen = waitFor(rReceiver, "incoming-offer");
  const send1 = rSender.offerFiles([rfile]);
  const o1 = await o1Seen;
  const got1 = waitFor(rReceiver, "file-received");
  rReceiver.acceptOffer(o1.batchId);
  const rec1 = await Promise.race([
    got1,
    new Promise((_, rej) => setTimeout(() => rej(new Error("fresh transfer hung")), 5000)),
  ]);
  assert.deepEqual(new Uint8Array(await rec1.blob.arrayBuffer()), bytes, "fresh offer still transfers byte-exact (no #171 regression)");
  await send1;
  assert.equal(begins.length, 1, "offer 1 sent one file-begin");
  assert.ok(begins[0], "offer 1 (fresh) carried a manifest");

  // Offer 2: RESUMED at a piece boundary. The receiver already holds [0, RESUME);
  // the sender must re-include the CACHED manifest (no re-read) and stream only the
  // tail, which the receiver verifies piece-by-piece — re-requesting the corrupt piece.
  prefix = bytes.subarray(0, RESUME); // the durable partial the receiver resumes onto
  armCorrupt = true;
  const o2Seen = waitFor(rReceiver, "incoming-offer");
  const send2 = rSender.offerFiles([rfile]);
  const o2 = await o2Seen;
  const got2 = waitFor(rReceiver, "file-received");
  rReceiver.acceptOffer(o2.batchId, undefined, { [o2.items[0].id]: RESUME });
  const rec2 = await Promise.race([
    got2,
    new Promise((_, rej) => setTimeout(() => rej(new Error("resumed transfer hung")), 5000)),
  ]);

  assert.equal(begins.length, 2, "offer 2 sent a second file-begin");
  assert.ok(begins[1], "the resumed file-begin re-included a manifest (#171)");
  assert.deepEqual(begins[1], begins[0], "the resumed manifest is the cached one (identical hashes, no re-read)");

  assert.equal(corrupted, 1, "the harness corrupted exactly one tail piece");
  assert.equal(pieceRequests, 1, "the resumed receiver re-requested exactly one piece (tail is verified, not trusted)");
  assert.equal(requestedIndex, 2, "the re-request named the corrupt tail piece's ABSOLUTE index");

  assert.equal(rec2.blob.size, N, "the resumed file completed to full size");
  assert.deepEqual(new Uint8Array(await rec2.blob.arrayBuffer()), bytes, "prefix + verified tail reassemble byte-exact");

  // Tail-only on the wire: the 3-piece tail plus exactly one re-sent piece — never a full resend.
  assert.equal(offer2BinaryBytes, N - RESUME + PIECE, "resume streamed only the tail plus the one re-requested piece");

  rSenderCh.send = rawSSend;
  rReceiverCh.send = rawRSend;
  await send2;
}

// --- no manifest for tiny files: the backward-compatible path is unchanged ------
{
  const tiny = new Blob(["small file, no manifest"], { type: "text/plain" });
  tiny.name = "tiny.txt";
  tiny.slice = Blob.prototype.slice;

  const tSender = new WarpPeer(sig, "tiny-remote", true);
  const tReceiver = new WarpPeer(sig, "tiny-local", false);
  const tSenderCh = tSender.pc.localChannel;
  const tReceiverCh = new FakeChannel();
  tSenderCh.peer = tReceiverCh;
  tReceiverCh.peer = tSenderCh;
  tReceiver.pc.dispatchEvent(Object.assign(new Event("datachannel"), { channel: tReceiverCh }));

  let tinyManifest = "unset";
  const tRawSend = tSenderCh.send.bind(tSenderCh);
  tSenderCh.send = (d) => {
    if (typeof d === "string") {
      const msg = JSON.parse(d);
      if (msg.t === "file-begin") tinyManifest = msg.pieces;
    }
    return tRawSend(d);
  };
  const tOfferSeen = waitFor(tReceiver, "incoming-offer");
  const tSendP = tSender.offerFiles([tiny]);
  const tOffer = await tOfferSeen;
  const tGot = waitFor(tReceiver, "file-received");
  tReceiver.acceptOffer(tOffer.batchId);
  const tReceived = await tGot;
  assert.equal(tinyManifest, undefined, "a file below the manifest floor carries NO manifest (legacy path)");
  assert.equal(await tReceived.blob.text(), "small file, no manifest", "tiny files still transfer byte-exact");
  tSenderCh.send = tRawSend;
  await tSendP;
}

// --- piece manifest (#137) liveness: an unanswerable re-request cancels, not hangs
// A receiver that re-requests a piece holds every other byte and (usually) file-end
// already — it waits on exactly that answer with a stuck verifier. If the sender
// CANNOT re-read the piece (the picked File's backing vanished), the old code
// silently no-op'd and the receiver froze forever at ~99% with no error. The fix
// fails the file honestly with an in-band cancel. Here we corrupt piece 2 in transit
// (forcing a re-request) AND make the sender's piece-2 re-read throw; the receiver
// must be cancelled — never left to hang, never a bogus file-received.
{
  const PIECE = 256 * 1024;
  const N = 5 * PIECE;
  const bytes = new Uint8Array(N);
  for (let i = 0; i < N; i += 1) bytes[i] = (i * 7 + 3) & 0xff;
  const lfile = new Blob([bytes], { type: "application/octet-stream" });
  lfile.name = "liveness.bin";
  const origSlice = Blob.prototype.slice;
  lfile.slice = origSlice;

  const lSender = new WarpPeer(sig, "live-remote", true);
  const lReceiver = new WarpPeer(sig, "live-local", false);
  const lSenderCh = lSender.pc.localChannel;
  const lReceiverCh = new FakeChannel();
  lSenderCh.peer = lReceiverCh;
  lReceiverCh.peer = lSenderCh;
  lReceiver.pc.dispatchEvent(Object.assign(new Event("datachannel"), { channel: lReceiverCh }));

  const CORRUPT_INDEX = 2;
  let forwardBinaries = 0;
  let resendNext = false;
  let corrupted = 0;
  let senderCancels = 0;
  const lRawSend = lSenderCh.send.bind(lSenderCh);
  lSenderCh.send = (d) => {
    if (typeof d === "string") {
      const msg = JSON.parse(d);
      if (msg.t === "file-begin") {
        // The manifest is already built (manifestFromFile ran before file-begin was
        // sent). From here on, make the sender's piece-2 RE-READ fail — as if the
        // File's backing disappeared — while leaving the forward stream (slice(0,N),
        // s===0) and every other piece's read intact.
        lfile.slice = function (s, e) {
          if (s === CORRUPT_INDEX * PIECE) {
            return { arrayBuffer: async () => { throw new Error("backing file gone"); } };
          }
          return origSlice.call(this, s, e);
        };
      }
      if (msg.t === "piece") resendNext = true;
      if (msg.t === "cancel") senderCancels += 1;
      return lRawSend(d);
    }
    if (resendNext) {
      resendNext = false;
      return lRawSend(d);
    }
    const idx = (forwardBinaries += 1);
    if (idx - 1 === CORRUPT_INDEX) {
      const src = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d);
      const bad = new Uint8Array(src);
      bad[10] ^= 0xff;
      corrupted += 1;
      return lRawSend(bad.buffer);
    }
    return lRawSend(d);
  };

  let pieceRequests = 0;
  const lRawRSend = lReceiverCh.send.bind(lReceiverCh);
  lReceiverCh.send = (d) => {
    if (typeof d === "string" && JSON.parse(d).t === "piece-request") pieceRequests += 1;
    return lRawRSend(d);
  };

  let bogusReceive = false;
  const offRecv = lReceiver.on("file-received", () => { bogusReceive = true; });

  const lOfferSeen = waitFor(lReceiver, "incoming-offer");
  const lSendP = lSender.offerFiles([lfile]);
  const lOffer = await lOfferSeen;
  const lCancelled = waitFor(lReceiver, "cancelled");
  lReceiver.acceptOffer(lOffer.batchId);

  // The receiver must be cancelled — not hang. A timeout here means the old hang.
  const cancelInfo = await Promise.race([
    lCancelled,
    new Promise((_, rej) => setTimeout(() => rej(new Error("unanswerable piece-request HUNG the receiver")), 5000)),
  ]);

  assert.equal(corrupted, 1, "the harness corrupted exactly one forward piece");
  assert.equal(pieceRequests, 1, "the receiver re-requested the corrupt piece");
  assert.equal(senderCancels, 1, "the sender answered the failed re-read with an honest cancel");
  assert.ok(cancelInfo && cancelInfo.id, "the receiver tore the partial down via the cancel path");
  assert.equal(bogusReceive, false, "no file-received fired for a file whose piece could not be re-read");

  offRecv();
  lSenderCh.send = lRawSend;
  lReceiverCh.send = lRawRSend;
  await lSendP;
}

console.log(
  "OK: offer/accept stream + text size cap + decline gating + disk-stream + instant-cancel + pending-offer channel-close rejection + send-pump backpressure + negotiated compression + piece-manifest targeted re-request + unanswerable-piece liveness (#137) + resumed-tail piece verification (#171) passed",
);
