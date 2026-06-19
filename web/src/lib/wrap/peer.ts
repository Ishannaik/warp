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
 * v1 scope: 1-to-1 happy path. We connect to the first available peer and route
 * all file transfers over that single channel. Multi-peer mesh (one channel per
 * remote, fan-out send) is intentionally out of scope.
 */

import type { SignalData, SignalingClient } from "./signaling";
import {
  CHUNK_SIZE,
  HIGH_WATER_MARK,
  LOW_WATER_MARK,
  fileId,
  type ControlMessage,
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
  /** A transfer item was created or updated (send or receive). */
  transfer: (item: TransferItem) => void;
  /** A receive finished and produced a downloadable result (fallback path). */
  received: (info: { id: string; name: string; mime: string; blob?: Blob }) => void;
  /** All queued sends finished. */
  "send-complete": () => void;
  error: (kind: PeerErrorKind) => void;
}

type Listener<K extends keyof PeerEvents> = PeerEvents[K];

/** Minimal File System Access API surface (not yet in lib.dom defaults). */
interface SaveFilePickerOptions {
  suggestedName?: string;
}
type ShowSaveFilePicker = (opts?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;

/** In-flight receive bookkeeping for the single active incoming file. */
interface IncomingState {
  item: TransferItem;
  writable: FileSystemWritableFileStream | null;
  chunks: ArrayBuffer[] | null; // fallback accumulator when FS Access unavailable
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
    received: new Set(),
    "send-complete": new Set(),
    error: new Set(),
  };

  /** Items keyed by id so progress updates mutate the same object. */
  private items = new Map<string, TransferItem>();
  private incoming: IncomingState | null = null;

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
      const s = this.pc.connectionState;
      if (s === "failed") {
        // STUN-only: a failed connection means NAT traversal lost. Be honest.
        this.emit("error", "nat-failed");
      } else if (s === "disconnected" || s === "closed") {
        if (!this.disposed) this.emit("error", "disconnected");
      }
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
   * Send a list of files sequentially over the open channel. Each file is
   * announced with a `file-offer`, streamed as 16 KiB chunks with backpressure,
   * then closed with `file-end`. Resolves when every file has been flushed.
   */
  async sendFiles(files: File[]): Promise<void> {
    const ch = this.channel;
    if (!ch || ch.readyState !== "open") throw new Error("channel-not-open");

    for (const file of files) {
      const id = fileId();
      const item: TransferItem = {
        id,
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
        direction: "send",
        status: "active",
        transferred: 0,
        progress: 0,
      };
      this.items.set(id, item);
      this.emit("transfer", { ...item });

      const offer: ControlMessage = {
        t: "file-offer",
        id,
        name: item.name,
        size: item.size,
        mime: item.mime,
      };
      ch.send(JSON.stringify(offer));

      await this.streamFile(ch, file, item);

      item.status = "done";
      item.transferred = item.size;
      item.progress = 100;
      this.emit("transfer", { ...item });

      const end: ControlMessage = { t: "file-end", id };
      ch.send(JSON.stringify(end));
    }

    const done: ControlMessage = { t: "all-done" };
    ch.send(JSON.stringify(done));
    this.emit("send-complete");
  }

  /** Pump one file's bytes through the channel, respecting the high-water mark. */
  private async streamFile(ch: RTCDataChannel, file: File, item: TransferItem): Promise<void> {
    let offset = 0;
    while (offset < file.size) {
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
      item.progress = Math.min(100, Math.round((offset / file.size) * 100));
      this.emit("transfer", { ...item });
    }
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

  // ---- receiving -----------------------------------------------------------

  private onMessage(data: unknown): void {
    if (typeof data === "string") {
      let msg: ControlMessage;
      try {
        msg = JSON.parse(data) as ControlMessage;
      } catch {
        return;
      }
      void this.onControl(msg);
      return;
    }
    // Binary chunk for the active incoming file.
    if (data instanceof ArrayBuffer) {
      void this.onChunk(data);
    } else if (data instanceof Blob) {
      void data.arrayBuffer().then((b) => this.onChunk(b));
    }
  }

  private async onControl(msg: ControlMessage): Promise<void> {
    if (msg.t === "file-offer") {
      const item: TransferItem = {
        id: msg.id,
        name: msg.name,
        size: msg.size,
        mime: msg.mime,
        direction: "receive",
        status: "active",
        transferred: 0,
        progress: 0,
      };
      this.items.set(msg.id, item);

      // Prefer streaming straight to disk; otherwise accumulate a Blob.
      const picker = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker })
        .showSaveFilePicker;
      let writable: FileSystemWritableFileStream | null = null;
      if (typeof picker === "function") {
        try {
          const handle = await picker({ suggestedName: msg.name });
          writable = await handle.createWritable();
        } catch {
          writable = null; // user cancelled the picker -> fall back to in-memory
        }
      }
      this.incoming = { item, writable, chunks: writable ? null : [] };
      this.emit("transfer", { ...item });
    } else if (msg.t === "file-end") {
      await this.finishIncoming(msg.id);
    } else if (msg.t === "all-done") {
      this.emit("send-complete");
    }
  }

  private async onChunk(buf: ArrayBuffer): Promise<void> {
    const inc = this.incoming;
    if (!inc) return;
    if (inc.writable) {
      await inc.writable.write(buf);
    } else if (inc.chunks) {
      inc.chunks.push(buf);
    }
    inc.item.transferred += buf.byteLength;
    inc.item.progress = Math.min(
      100,
      Math.round((inc.item.transferred / Math.max(1, inc.item.size)) * 100),
    );
    this.emit("transfer", { ...inc.item });
  }

  private async finishIncoming(id: string): Promise<void> {
    const inc = this.incoming;
    if (!inc || inc.item.id !== id) return;

    inc.item.status = "done";
    inc.item.transferred = inc.item.size;
    inc.item.progress = 100;
    this.emit("transfer", { ...inc.item });

    if (inc.writable) {
      await inc.writable.close();
      this.emit("received", { id, name: inc.item.name, mime: inc.item.mime });
    } else if (inc.chunks) {
      const blob = new Blob(inc.chunks, { type: inc.item.mime });
      triggerDownload(blob, inc.item.name);
      this.emit("received", { id, name: inc.item.name, mime: inc.item.mime, blob });
    }
    this.incoming = null;
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

/** Fallback download via a transient anchor + object URL. */
function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
