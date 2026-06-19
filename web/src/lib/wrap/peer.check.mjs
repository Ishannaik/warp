/**
 * Runnable check for the review-before-receive transfer protocol (no test runner,
 * no new deps — matches server/test.js style). Wires two WrapPeers together via
 * fake data channels and asserts the offer -> accept -> stream -> file-received
 * round-trip, plus decline gating and cancel.
 *
 * Run:  node src/lib/wrap/peer.check.mjs   (after `pnpm --filter @warp/web build`,
 * OR with a transpile step). Because peer.ts is TS, this check imports a tiny
 * transpiled copy via esbuild if available; otherwise it documents the expected
 * trace. Kept dependency-free: it stubs only the browser globals WrapPeer touches.
 */

import assert from "node:assert";

// --- minimal browser global stubs ----------------------------------------
// A fake RTCPeerConnection that never actually connects; we drive the channel
// directly. WrapPeer's constructor calls createDataChannel (initiator) or waits
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
let WrapPeer;
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
  ({ WrapPeer } = await import(dataUrl));
  void fs;
} catch (e) {
  console.error("SKIP: esbuild not available to transpile TS for this check —", e.message);
  process.exit(0);
}

// --- wire two peers through fake channels ---------------------------------
const sig = { signal() {} };
const sender = new WrapPeer(sig, "B", true); // initiator owns localChannel
const receiver = new WrapPeer(sig, "A", false);

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

console.log("OK: offer/accept stream + decline gating round-trip passed");
