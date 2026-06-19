/**
 * WebRTC peer + reliable data channel engine.
 *
 * STUN-only (no TURN): we discover public reflexive candidates via Google's
 * public STUN servers and attempt a direct peer-to-peer connection. If NAT
 * traversal fails we surface an honest `nat-failed` error rather than silently
 * relaying through a server.
 *
 * Glare-free role assignment:
 *   - The NEW peer (the one that just joined and was handed the existing
 *     `peers` list) is the *initiator*: it creates the data channel and sends
 *     the SDP offer to each existing peer.
 *   - Existing peers are *responders*: they received `peer-joined`, so they sit
 *     and wait for the incoming offer + `datachannel` event.
 * Because exactly one side ever creates the offer for a given pair, there is no
 * offer collision to resolve.
 *
 * Symmetric file transfer (review-before-receive redesign):
 *   - EITHER peer can offer files at any time over the same open channel.
 *   - A send batch is GATED: the sender announces a manifest (`offer`), the
 *     receiver shows an accept modal, and only on `accept` do bytes flow. On
 *     `decline` nothing is sent.
 *   - Received files are accumulated into an in-memory Blob and handed to the
 *     UI via "file-received" — NOTHING auto-saves to disk. Downloading (one
 *     file, or a zip of all) is the UI's job now.
 *   - The channel STAYS OPEN after a batch: both peers can keep sending.
 *
 * v1 transport scope: 1-to-1 happy path. We connect to the first available peer
 * and route all transfers over that single channel. Multi-peer mesh is out of
 * scope.
 */

import type { SignalData, SignalingClient } from "./signaling";
import {
  CHUNK_SIZE,
  HIGH_WATER_MARK,
  LOW_WATER_MARK,
  fileId,
  type ControlMessage,
  type OfferItem,
  type TransferItem,
} from "./transfer";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type PeerErrorKind = "nat-failed" | "disconnected" | "channel-error";

export interface PeerEvents {
  /** Data channel is open and ready to carry files. */
  connected: () => void;
  /** A transfer item was created or updated (send or receive, both directions). */
  transfer: (item: TransferItem) => void;
  /** A batch manifest arrived; the receiver shows an accept modal. The peer
   *  holds the pending manifest until accept/decline. */
  "incoming-offer": (info: { batchId: string; items: OfferItem[] }) => void;
  /** A file fully arrived. The blob is held in memory for manual download — NO
   *  auto-download happens here. */
  "file-received": (info: { id: string; name: string; mime: string; blob: Blob }) => void;
  /** A text snippet arrived (shown directly in the tray). */
  "text-received": (info: { id: string; text: string }) => void;
  /** A batch we offered was declined by the receiver. */
  declined: (info: { batchId: string }) => void;
  /** A file in flight was cancelled by either side. */
  cancelled: (info: { id: string }) => void;
  error: (kind: PeerErrorKind) => void;
}

type Listener<K extends keyof PeerEvents> = PeerEvents[K];

/** A batch the local side has offered and is waiting on (or streaming). */
interface OutgoingBatch {
  batchId: string;
  files: File[];
  /** Resolves when the receiver accepts; rejects when declined. */
  resolve: () => void;
  reject: (reason: "declined") => void;
  /** Set true the moment the receiver responds, so a late dup is ignored. */
  settled: boolean;
}

/** In-flight receive bookkeeping for the single active incoming file. */
interface IncomingState {
  item: TransferItem;
  /** In-memory accumulator for the current file's chunks. */
  chunks: ArrayBuffer[];
}

export class WrapPeer {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private signaling: SignalingClient;
  private remoteId: string | null = null;
  private readonly initiator: boolean;
  private disposed = false;

  private listeners: { [K in keyof PeerEvents]: Set<Listener<K>> } = {
    connected: new Set(),
    transfer: new Set(),
    "incoming-offer": new Set(),
    "file-received": new Set(),
    "text-received": new Set(),
    declined: new Set(),
    cancelled: new Set(),
    error: new Set(),
  };

  /** Items keyed by id so progress updates mutate the same object. */
  private items = new Map<string, TransferItem>();

  /** The single active incoming file (only one in flight at a time). */
  private incoming: IncomingState | null = null;

  /** Batches we've offered, keyed by batchId, awaiting accept/decline. */
  private outgoing = new Map<string, OutgoingBatch>();

  /** Pending inbound manifests by batchId, stored until the user accepts. */
  private pendingOffers = new Map<string, OfferItem[]>();

  /** Files the receiver has accepted, keyed by batchId, so incoming chunks land. */
  private acceptedBatches = new Set<string>();

  /** File ids the local side asked to cancel, so we drop their remaining chunks. */
  private cancelledIds = new Set<string>();

  constructor(signaling: SignalingClient, remoteId: string, initiator: boolean) {
    this.signaling = signaling;
    this.remoteId = remoteId;
    this.initiator = initiator;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.wirePeerConnection();

    if (initiator) {
      // Initiator owns the channel.
      const ch = this.pc.createDataChannel("wrap", { ordered: true });
      this.attachChannel(ch);
    } else {
      // Responder waits for the remote's channel.
      this.pc.addEventListener("datachannel", (ev) => this.attachChannel(ev.channel));
    }
  }

  on<K extends keyof PeerEvents>(event: K, fn: Listener<K>): () => void {
    this.listeners[event].add(fn);
    return () => this.listeners[event].delete(fn);
  }

  private emit<K extends keyof PeerEvents>(event: K, ...args: Parameters<Listener<K>>): void {
    for (const fn of this.listeners[event]) {
      (fn as (...a: unknown[]) => void)(...args);
    }
  }

  // ---- signalling glue -----------------------------------------------------

  private wirePeerConnection(): void {
    this.pc.addEventListener("icecandidate", (ev) => {
      if (ev.candidate && this.remoteId) {
        this.signaling.signal(this.remoteId, { kind: "ice", candidate: ev.candidate.toJSON() });
      }
    });

    this.pc.addEventListener("connectionstatechange", () => {
      if (this.disposed) return; // ignore teardown after an explicit close
      const s = this.pc.connectionState;
      if (s === "failed") {
        // Terminal: couldn't establish (or keep) a direct route. Be honest.
        this.emit("error", "nat-failed");
      }
      // Note: "disconnected" is often transient (ICE can recover) and "closed" is
      // normal teardown — neither is surfaced as a failure on its own. The channel
      // stays usable across batches, so we never flip a "completed" latch here.
    });
  }

  /** Initiator: build and send the offer once peer construction is done. */
  async start(): Promise<void> {
    if (!this.initiator || !this.remoteId) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.signaling.signal(this.remoteId, { kind: "offer", sdp: offer.sdp ?? "" });
  }

  /** Feed an inbound signal frame (offer / answer / ice) from the server. */
  async handleSignal(from: string, data: SignalData): Promise<void> {
    if (this.remoteId && from !== this.remoteId) return; // ignore other peers (v1)
    this.remoteId = from;

    if (data.kind === "offer") {
      await this.pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.signaling.signal(from, { kind: "answer", sdp: answer.sdp ?? "" });
    } else if (data.kind === "answer") {
      await this.pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
    } else if (data.kind === "ice") {
      try {
        await this.pc.addIceCandidate(data.candidate);
      } catch {
        /* candidate arrived before remote description; browser will retry */
      }
    }
  }

  // ---- data channel --------------------------------------------------------

  private attachChannel(ch: RTCDataChannel): void {
    this.channel = ch;
    ch.binaryType = "arraybuffer";
    ch.bufferedAmountLowThreshold = LOW_WATER_MARK;

    ch.addEventListener("open", () => this.emit("connected"));
    ch.addEventListener("error", () => {
      if (!this.disposed) this.emit("error", "channel-error");
    });
    ch.addEventListener("message", (ev) => this.onMessage(ev.data));
  }

  get isConnected(): boolean {
    return this.channel?.readyState === "open";
  }

  // ---- sending -------------------------------------------------------------

  /**
   * Offer a list of files. Builds a manifest (with best-effort image thumbnails),
   * sends it, creates "offered" send-items, and AWAITS the receiver's response.
   * On accept: streams each file (file-begin / chunks / file-end) updating
   * progress to done. On decline: marks every item "declined". NEVER closes the
   * channel — both peers can offer again afterwards.
   */
  async offerFiles(files: File[]): Promise<void> {
    const ch = this.channel;
    if (!ch || ch.readyState !== "open") throw new Error("channel-not-open");
    if (!files.length) return;

    const batchId = fileId();

    // Build the manifest + create local send-items in lockstep so ids match.
    const manifest: OfferItem[] = [];
    const ids: string[] = [];
    for (const file of files) {
      const id = fileId();
      ids.push(id);
      const mime = file.type || "application/octet-stream";
      const thumb = await makeThumb(file); // best-effort; undefined on non-image/failure
      manifest.push({ id, name: file.name, size: file.size, mime, ...(thumb ? { thumb } : {}) });

      const item: TransferItem = {
        id,
        batchId,
        name: file.name,
        size: file.size,
        mime,
        kind: "file",
        direction: "send",
        status: "offered",
        transferred: 0,
        progress: 0,
        ...(thumb ? { thumb } : {}),
      };
      this.items.set(id, item);
      this.emit("transfer", { ...item });
    }

    // Register the pending batch BEFORE sending, so an instant accept/decline finds it.
    const accepted = new Promise<void>((resolve, reject) => {
      this.outgoing.set(batchId, { batchId, files, resolve, reject, settled: false });
    });

    this.send(ch, { t: "offer", batchId, items: manifest });

    try {
      await accepted;
    } catch {
      // Declined: mark every item declined and bail (channel stays open).
      for (const id of ids) this.markStatus(id, "declined");
      return;
    }

    // Accepted: stream each file in order.
    for (let i = 0; i < files.length; i += 1) {
      const id = ids[i];
      const file = files[i];
      const item = this.items.get(id);
      if (!item) continue;

      if (this.cancelledIds.has(id)) {
        this.cancelledIds.delete(id);
        continue; // cancelled before it started; status already set by cancel()
      }

      item.status = "transferring";
      this.emit("transfer", { ...item });

      this.send(ch, { t: "file-begin", id });
      const finishedClean = await this.streamFile(ch, file, item);
      if (!finishedClean) {
        // Cancelled mid-flight: tell the receiver and stop this file.
        this.send(ch, { t: "cancel", id });
        continue;
      }
      this.send(ch, { t: "file-end", id });

      item.status = "done";
      item.transferred = item.size;
      item.progress = 100;
      this.emit("transfer", { ...item });
    }
  }

  /** Send a text snippet — shown directly in the other side's tray (no accept). */
  sendText(text: string): void {
    const ch = this.channel;
    if (!ch || ch.readyState !== "open") throw new Error("channel-not-open");
    const id = fileId();
    const batchId = fileId();
    const bytes = new Blob([text]).size;
    const item: TransferItem = {
      id,
      batchId,
      name: "Text snippet",
      size: bytes,
      mime: "text/plain",
      kind: "text",
      direction: "send",
      status: "done",
      transferred: bytes,
      progress: 100,
      text,
    };
    this.items.set(id, item);
    this.emit("transfer", { ...item });
    this.send(ch, { t: "text", id, text });
  }

  /** Receiver: accept a pending offered batch -> the sender starts streaming. */
  acceptOffer(batchId: string): void {
    const items = this.pendingOffers.get(batchId);
    if (!items) return;
    this.pendingOffers.delete(batchId);
    this.acceptedBatches.add(batchId);

    // Create receive-items in the tray (offered -> they'll go transferring/done).
    for (const oi of items) {
      const item: TransferItem = {
        id: oi.id,
        batchId,
        name: oi.name,
        size: oi.size,
        mime: oi.mime,
        kind: "file",
        direction: "receive",
        status: "offered",
        transferred: 0,
        progress: 0,
        ...(oi.thumb ? { thumb: oi.thumb } : {}),
      };
      this.items.set(oi.id, item);
      this.emit("transfer", { ...item });
    }

    const ch = this.channel;
    if (ch && ch.readyState === "open") this.send(ch, { t: "accept", batchId });
  }

  /** Receiver: decline a pending offered batch -> the sender sends nothing. */
  declineOffer(batchId: string): void {
    if (!this.pendingOffers.has(batchId)) return;
    this.pendingOffers.delete(batchId);
    const ch = this.channel;
    if (ch && ch.readyState === "open") this.send(ch, { t: "decline", batchId });
  }

  /**
   * Cancel a file in flight from either side. The sender stops pumping and tells
   * the receiver; the receiver discards the partial and tells the sender. The
   * local item is marked "cancelled" immediately.
   */
  cancel(id: string): void {
    const item = this.items.get(id);
    if (!item || item.status === "done" || item.status === "cancelled") return;

    this.cancelledIds.add(id);
    this.markStatus(id, "cancelled");

    // If we're the receiver and this is the active incoming file, drop it.
    if (this.incoming && this.incoming.item.id === id) this.incoming = null;

    const ch = this.channel;
    if (ch && ch.readyState === "open") this.send(ch, { t: "cancel", id });
    this.emit("cancelled", { id });
  }

  /** Pump one file's bytes through the channel. Returns false if cancelled mid-flight. */
  private async streamFile(ch: RTCDataChannel, file: File, item: TransferItem): Promise<boolean> {
    let offset = 0;
    while (offset < file.size) {
      if (this.cancelledIds.has(item.id)) {
        this.cancelledIds.delete(item.id);
        return false;
      }
      // Backpressure: wait until the send buffer drains below the high-water mark.
      if (ch.bufferedAmount > HIGH_WATER_MARK) {
        await this.waitForDrain(ch);
      }
      if (ch.readyState !== "open") throw new Error("channel-closed-mid-send");

      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buf = await slice.arrayBuffer();
      ch.send(buf);
      offset += buf.byteLength;

      item.transferred = offset;
      item.progress = Math.min(100, Math.round((offset / Math.max(1, file.size)) * 100));
      this.emit("transfer", { ...item });
    }
    return true;
  }

  private waitForDrain(ch: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      const onLow = () => {
        ch.removeEventListener("bufferedamountlow", onLow);
        resolve();
      };
      ch.addEventListener("bufferedamountlow", onLow);
    });
  }

  private send(ch: RTCDataChannel, msg: ControlMessage): void {
    ch.send(JSON.stringify(msg));
  }

  /** Update an item's status by id and re-emit. */
  private markStatus(id: string, status: TransferItem["status"]): void {
    const item = this.items.get(id);
    if (!item) return;
    item.status = status;
    this.emit("transfer", { ...item });
  }

  // ---- receiving -----------------------------------------------------------

  private onMessage(data: unknown): void {
    if (typeof data === "string") {
      let msg: ControlMessage;
      try {
        msg = JSON.parse(data) as ControlMessage;
      } catch {
        return;
      }
      this.onControl(msg);
      return;
    }
    // Binary chunk for the active incoming file.
    if (data instanceof ArrayBuffer) {
      this.onChunk(data);
    } else if (data instanceof Blob) {
      void data.arrayBuffer().then((b) => this.onChunk(b));
    }
  }

  private onControl(msg: ControlMessage): void {
    switch (msg.t) {
      case "offer": {
        // Stash the manifest and surface the accept modal; bytes wait for accept.
        this.pendingOffers.set(msg.batchId, msg.items);
        this.emit("incoming-offer", { batchId: msg.batchId, items: msg.items });
        break;
      }
      case "accept": {
        const batch = this.outgoing.get(msg.batchId);
        if (batch && !batch.settled) {
          batch.settled = true;
          this.outgoing.delete(msg.batchId);
          batch.resolve();
        }
        break;
      }
      case "decline": {
        const batch = this.outgoing.get(msg.batchId);
        if (batch && !batch.settled) {
          batch.settled = true;
          this.outgoing.delete(msg.batchId);
          batch.reject("declined");
        }
        this.emit("declined", { batchId: msg.batchId });
        break;
      }
      case "file-begin": {
        this.startIncoming(msg.id);
        break;
      }
      case "file-end": {
        this.finishIncoming(msg.id);
        break;
      }
      case "cancel": {
        // Remote cancelled this file: drop the partial, mark cancelled.
        if (this.incoming && this.incoming.item.id === msg.id) this.incoming = null;
        this.cancelledIds.add(msg.id);
        this.markStatus(msg.id, "cancelled");
        this.emit("cancelled", { id: msg.id });
        break;
      }
      case "text": {
        const bytes = new Blob([msg.text]).size;
        const item: TransferItem = {
          id: msg.id,
          batchId: msg.id,
          name: "Text snippet",
          size: bytes,
          mime: "text/plain",
          kind: "text",
          direction: "receive",
          status: "done",
          transferred: bytes,
          progress: 100,
          text: msg.text,
        };
        this.items.set(msg.id, item);
        this.emit("transfer", { ...item });
        this.emit("text-received", { id: msg.id, text: msg.text });
        break;
      }
    }
  }

  /** A file's chunks are about to arrive. The receive-item was created on accept. */
  private startIncoming(id: string): void {
    if (this.cancelledIds.has(id)) return; // cancelled before bytes flowed
    const item = this.items.get(id);
    if (!item || item.direction !== "receive") return; // unaccepted / unknown -> ignore
    item.status = "transferring";
    this.emit("transfer", { ...item });
    this.incoming = { item, chunks: [] };
  }

  private onChunk(buf: ArrayBuffer): void {
    const inc = this.incoming;
    if (!inc) return; // no active incoming file (cancelled / not accepted)
    inc.chunks.push(buf);
    inc.item.transferred += buf.byteLength;
    inc.item.progress = Math.min(
      100,
      Math.round((inc.item.transferred / Math.max(1, inc.item.size)) * 100),
    );
    this.emit("transfer", { ...inc.item });
  }

  /**
   * The active incoming file finished. Build ONE in-memory Blob, attach it to the
   * item, and emit "file-received". NOTHING is auto-saved — the UI downloads on
   * demand.
   *
   * ponytail: every received file's bytes live in memory (item.blob) until the
   * user downloads or the session ends. RAM ceiling = sum of all received,
   * not-yet-discarded file sizes. Acceptable for a P2P tray; very large multi-GB
   * batches on a low-RAM device can still OOM.
   */
  private finishIncoming(id: string): void {
    const inc = this.incoming;
    if (!inc || inc.item.id !== id) return;
    this.incoming = null;

    const blob = new Blob(inc.chunks, { type: inc.item.mime });
    inc.item.blob = blob;
    inc.item.status = "done";
    inc.item.transferred = inc.item.size;
    inc.item.progress = 100;
    this.emit("transfer", { ...inc.item });
    this.emit("file-received", { id, name: inc.item.name, mime: inc.item.mime, blob });
  }

  // ---- teardown ------------------------------------------------------------

  close(): void {
    this.disposed = true;
    try {
      this.channel?.close();
    } catch {
      /* noop */
    }
    try {
      this.pc.close();
    } catch {
      /* noop */
    }
  }
}

/** Max edge of a generated thumbnail, in CSS pixels. */
const THUMB_MAX = 64;

/**
 * Best-effort image thumbnail as a small low-quality JPEG data URL. Returns
 * undefined for non-images or any failure (decode error, no canvas, etc.) — the
 * caller treats a missing thumb as fine.
 */
async function makeThumb(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return undefined;
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, THUMB_MAX / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return undefined;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.5);
  } catch {
    return undefined;
  }
}
