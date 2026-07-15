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
  LOW_WATER_MARK,
  fileId,
  type ControlMessage,
  type OfferItem,
  type TransferItem,
} from "./transfer";
import { diskSink, memorySink, type ReceiveSink } from "./receiveController";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/**
 * Send-pump tuning (speed). These intentionally diverge from the 16 KiB design
 * constant in transfer.ts: the wire is chunk-size-agnostic (the receiver just
 * concatenates ArrayBuffers into a Blob), so we send far fewer, much larger
 * SCTP messages to push a Chrome<->Chrome channel toward the WiFi link rate
 * instead of stalling on ~16x more micro-reads/messages.
 *
 *  - TARGET_SEND_CHUNK: preferred per-message size. usrsctp (Chrome & Firefox)
 *    accepts up to 256 KiB; we cap to the negotiated pc.sctp.maxMessageSize at
 *    runtime and never exceed it (a too-big message closes the channel).
 *  - MIN_SEND_CHUNK: safe floor if maxMessageSize reports something tiny/0
 *    (e.g. the legacy 16 KiB / 64 KiB default on an old/odd stack).
 *  - READ_BLOCK: how much of the file we pull into memory per blob.arrayBuffer()
 *    read, then slice into TARGET_SEND_CHUNK sends — one await per ~4 MiB instead
 *    of one per 16 KiB.
 *  - SEND_HIGH_WATER: bufferedAmount backpressure ceiling. MUST sit well below
 *    Chrome's hard 16 MiB SCTP send-buffer cap: bufferedAmount can never
 *    exceed that cap (send() throws first), so a 16 MiB high-water mark meant
 *    the backpressure branch NEVER ran and every large transfer deterministically
 *    died ~⅓ in with a mid-send exception once the file outpaced the link.
 *    8 MiB keeps the pipe full while leaving real headroom. Resume happens on
 *    `bufferedamountlow` at LOW_WATER_MARK (1 MiB).
 */
const TARGET_SEND_CHUNK = 256 * 1024;
const MIN_SEND_CHUNK = 16 * 1024;
const READ_BLOCK = 4 * 1024 * 1024;
const SEND_HIGH_WATER = 8 * 1024 * 1024;

/**
 * Mid-session transport recovery. A `disconnected`/`failed` connectionState is
 * NOT terminal: Wi-Fi power-save, a locked phone screen, or a network flap can
 * drop ICE while the SCTP channel object survives. The initiator ICE-restarts
 * (up to MAX_ICE_RESTARTS, re-checking every RESTART_CHECK_MS); the send pump
 * simply stalls on backpressure meanwhile and resumes byte-exact when the
 * transport comes back — no data is lost (SCTP is reliable+ordered).
 * DISCONNECT_GRACE_MS gives "disconnected" a chance to self-heal first.
 */
const MAX_ICE_RESTARTS = 3;
const RESTART_CHECK_MS = 7000;
const DISCONNECT_GRACE_MS = 3000;

/**
 * Minimal File System Access API surface we use to stream large files straight
 * to disk (avoids accumulating a multi-GB Blob in memory). Only the members we
 * touch are declared; the hook obtains the handles from showSaveFilePicker /
 * showDirectoryPicker and passes them in as an accept target.
 */
export interface FsWritable {
  write(chunk: ArrayBuffer | Blob | Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}
export interface FsFileHandle {
  readonly name: string;
  createWritable(): Promise<FsWritable>;
}
export interface FsDirHandle {
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
}

/**
 * Where a receiver wants accepted files to land. Omitted => in-memory Blob tray
 * (today's behaviour). `dirHandle` => a multi-file batch into one folder;
 * `fileHandle` => a single file. The hook chooses (and prompts) based on size.
 */
export type AcceptTarget = { dirHandle: FsDirHandle } | { fileHandle: FsFileHandle };

export type PeerErrorKind = "nat-failed" | "disconnected" | "channel-error";

export interface PeerEvents {
  /** Data channel is open and ready to carry files. */
  connected: () => void;
  /** Transport dropped mid-session; an ICE restart is being attempted. */
  reconnecting: () => void;
  /** Transport recovered after `reconnecting`; in-flight transfers resume. */
  recovered: () => void;
  /** A transfer item was created or updated (send or receive, both directions). */
  transfer: (item: TransferItem) => void;
  /** A batch manifest arrived; the receiver shows an accept modal. The peer
   *  holds the pending manifest until accept/decline. */
  "incoming-offer": (info: { batchId: string; items: OfferItem[] }) => void;
  /** A file fully arrived. For an in-memory transfer `blob` holds the bytes for
   *  manual download (no auto-download). For a large transfer streamed straight
   *  to disk there is NO blob and `savedToDisk` is true (the file is already on
   *  disk under `name`). */
  "file-received": (
    info:
      | { id: string; name: string; mime: string; blob: Blob; savedToDisk?: false }
      | { id: string; name: string; mime: string; blob?: undefined; savedToDisk: true },
  ) => void;
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
  /** Durable-write sink (memory or disk), owned by the ReceiveHost. The sink's
   *  bytesWritten is the single source of truth for how many bytes are durable —
   *  used both for progress and as the resume offset the receiver reports. */
  sink: ReceiveSink;
}

/**
 * Where an in-flight file's bytes go. WarpPeer is sink-agnostic: it asks the host
 * to `begin` a sink for a file and reads/writes through it, so the OWNER of the
 * bytes can live OUTSIDE the peer (the hook, in a registry keyed by file identity)
 * and survive a peer rebuild on a reconnect — the key to disk resume.
 *
 * When no host is injected, WarpPeer uses DefaultReceiveHost (below), preserving
 * the standalone memory/disk behaviour the check harness exercises.
 */
export interface ReceiveHost {
  /** Start (or resume) receiving `id` (identity `key`); returns its sink. */
  begin(key: string, id: string, item: TransferItem, target?: AcceptTarget): ReceiveSink;
  /** The live sink for `id`, if any. */
  get(id: string): ReceiveSink | undefined;
  /** Disk mode: the on-disk name chosen (deduped); undefined for memory mode. */
  savedName(id: string): string | undefined;
  /** Done with `id` (completed or cancelled) — the host may drop its entry. */
  end(id: string): void;
}

/**
 * Default, peer-local host: one sink per file id, memory unless an AcceptTarget is
 * supplied (then disk). Names are de-duped within a dir target. This is the
 * behaviour the engine had before the registry refactor; the hook injects its own
 * host to make receives survive reconnects.
 */
export class DefaultReceiveHost implements ReceiveHost {
  private sinks = new Map<string, ReceiveSink>();
  private names = new Map<string, string>();
  private usedInDir = new Map<AcceptTarget, Set<string>>();

  begin(_key: string, id: string, item: TransferItem, target?: AcceptTarget): ReceiveSink {
    if (!target) {
      const s = memorySink(item.mime);
      this.sinks.set(id, s);
      return s;
    }
    const saved =
      "dirHandle" in target ? this.uniqueName(target, item.name) : target.fileHandle.name || item.name;
    this.names.set(id, saved);
    const s = diskSink(async () =>
      "dirHandle" in target
        ? await (await target.dirHandle.getFileHandle(saved, { create: true })).createWritable()
        : await target.fileHandle.createWritable(),
    );
    this.sinks.set(id, s);
    return s;
  }
  get(id: string): ReceiveSink | undefined {
    return this.sinks.get(id);
  }
  savedName(id: string): string | undefined {
    return this.names.get(id);
  }
  end(id: string): void {
    this.sinks.delete(id);
    this.names.delete(id);
  }
  private uniqueName(target: AcceptTarget, name: string): string {
    const used = this.usedInDir.get(target) ?? new Set<string>();
    this.usedInDir.set(target, used);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let n = 1;
    let candidate = `${stem} (${n})${ext}`;
    while (used.has(candidate)) candidate = `${stem} (${(n += 1)})${ext}`;
    used.add(candidate);
    return candidate;
  }
}

export class WarpPeer {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private signaling: SignalingClient;
  private remoteId: string | null = null;
  private readonly initiator: boolean;
  private disposed = false;

  private listeners: { [K in keyof PeerEvents]: Set<Listener<K>> } = {
    connected: new Set(),
    reconnecting: new Set(),
    recovered: new Set(),
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

  /** Disk target per accepted batch (when streaming to disk). Absent => in-memory. */
  private acceptTargets = new Map<string, AcceptTarget>();

  /** Identity key per accepted receive id (from the offer manifest), for resume matching. */
  private incomingKeys = new Map<string, string>();

  /** Where in-flight received bytes go. Injected so the hook can own state across rebuilds. */
  private readonly host: ReceiveHost;

  /** File ids the local side asked to cancel, so we drop their remaining chunks. */
  private cancelledIds = new Set<string>();

  /** True once the transport has EVER been up — separates a real NAT failure
   *  (never connected) from a mid-session drop (recoverable). */
  private everConnected = false;
  private restartAttempts = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(signaling: SignalingClient, remoteId: string, initiator: boolean, host?: ReceiveHost) {
    this.signaling = signaling;
    this.remoteId = remoteId;
    this.initiator = initiator;
    this.host = host ?? new DefaultReceiveHost();
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.wirePeerConnection();

    if (initiator) {
      // Initiator owns the channel.
      const ch = this.pc.createDataChannel("warp", { ordered: true });
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
    if (this.disposed) return; // a closed peer must not resurrect UI state
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
      if (s === "connected") {
        const wasDown = this.restartAttempts > 0 || this.restartTimer !== null;
        this.clearRestartTimer();
        this.everConnected = true;
        this.restartAttempts = 0;
        if (wasDown) this.emit("recovered");
        return;
      }
      // "disconnected" is often transient — give ICE a grace window to self-heal
      // before forcing a restart. "failed" gets an immediate restart attempt.
      // Neither is terminal on its own anymore: a mid-transfer drop (locked
      // phone, Wi-Fi flap) is recoverable, and calling it "nat-failed" was a lie.
      if (s === "disconnected") this.scheduleRestart(DISCONNECT_GRACE_MS);
      else if (s === "failed") this.scheduleRestart(0);
    });
  }

  private clearRestartTimer(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private scheduleRestart(delay: number): void {
    if (this.disposed || this.restartTimer !== null) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.attemptRestart();
    }, delay);
  }

  /**
   * Try to bring a dropped transport back. Only the INITIATOR renegotiates
   * (createOffer after restartIce) — the responder never offers, so there is no
   * glare; it just waits here for the initiator's restart offer to arrive via
   * the normal handleSignal path. Gives up after MAX_ICE_RESTARTS checks:
   *   - never connected at all  -> honest "nat-failed" (a real NAT block)
   *   - was connected, then died -> "disconnected" (the hook salvages + rebuilds)
   */
  private async attemptRestart(): Promise<void> {
    if (this.disposed) return;
    const s = this.pc.connectionState;
    if (s === "connected" || s === "closed") return;

    if (!this.everConnected) {
      if (s === "failed") this.emit("error", "nat-failed");
      return; // still "connecting"/"disconnected" pre-connect: let ICE keep trying
    }
    if (this.restartAttempts >= MAX_ICE_RESTARTS) {
      this.emit("error", "disconnected");
      return;
    }
    this.restartAttempts += 1;
    this.emit("reconnecting");

    if (this.initiator && this.remoteId) {
      try {
        this.pc.restartIce();
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.signaling.signal(this.remoteId, { kind: "offer", sdp: offer.sdp ?? "" });
      } catch {
        /* pc unusable; the re-check below surfaces the failure */
      }
    }
    // Either we recover (the "connected" branch resets attempts) or this fires
    // again and eventually gives up.
    this.scheduleRestart(RESTART_CHECK_MS);
  }

  /** Initiator: build and send the offer once peer construction is done. */
  async start(): Promise<void> {
    if (!this.initiator || !this.remoteId) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.signaling.signal(this.remoteId, { kind: "offer", sdp: offer.sdp ?? "" });
  }

  /** Feed an inbound signal frame (offer / answer / ice / cancel) from the server. */
  async handleSignal(from: string, data: SignalData): Promise<void> {
    if (this.remoteId && from !== this.remoteId) return; // ignore other peers (v1)
    this.remoteId = from;

    if (data.kind === "cancel") {
      // Out-of-band cancel: the other side aborted a file. Apply it immediately —
      // this beats the in-band {t:"cancel"} that's stuck behind the byte backlog.
      // Idempotent, so the later in-band dup is a harmless no-op.
      this.applyCancel(data.id);
      return;
    }

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
    // SCTP is gone for good once the channel closes (an ICE restart can't revive
    // a closed channel). Surface it so the hook can salvage + rebuild the peer.
    ch.addEventListener("close", () => {
      this.clearRestartTimer();
      if (!this.disposed) this.emit("error", "disconnected");
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

    // Accepted: stream each file in order. A transport death mid-batch is NOT
    // terminal for the app: mark the in-flight + unsent items "error" so the
    // hook can salvage them into an automatic re-offer once the peer rebuilds.
    try {
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

        this.send(ch, { t: "file-begin", id, offset: 0 });
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
    } catch {
      for (const id of ids) {
        const it = this.items.get(id);
        if (it && (it.status === "transferring" || it.status === "offered")) {
          this.markStatus(id, "error");
        }
      }
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

  /**
   * Receiver: accept a pending offered batch -> the sender starts streaming.
   *
   * `target` is OPTIONAL. When omitted (the default / small-batch path) accepted
   * files accumulate in an in-memory Blob exactly as before. When provided, each
   * received file is streamed STRAIGHT TO DISK via the File System Access API —
   * no Blob accumulation — and emitted with `savedToDisk:true` and no blob:
   *   - { dirHandle }  : a multi-file batch, each file written into that folder
   *                      (names de-duped within the folder).
   *   - { fileHandle } : a single file written to that handle.
   */
  acceptOffer(batchId: string, target?: AcceptTarget): void {
    const items = this.pendingOffers.get(batchId);
    if (!items) return;
    this.pendingOffers.delete(batchId);
    this.acceptedBatches.add(batchId);
    if (target) this.acceptTargets.set(batchId, target);

    // Create receive-items in the tray (offered -> they'll go transferring/done).
    for (const oi of items) {
      // Remember the identity key so a later re-offer of the same file can resume
      // its partial. Fall back to name:size if a stale sender omitted `key`.
      this.incomingKeys.set(oi.id, oi.key ?? `${oi.name}:${oi.size}`);
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
   * Cancel a file in flight from either side. The sender stops pumping and the
   * receiver discards the partial; the local item is marked "cancelled" at once.
   *
   * The cancel is announced TWO ways for speed and resilience:
   *   1. OUT-OF-BAND over the always-open signaling socket — bypasses the up-to-
   *      16 MiB in-flight data-channel backlog, so the other side reacts within a
   *      network RTT instead of after the byte buffer drains.
   *   2. IN-BAND over the data channel (legacy path) — survives a dropped socket.
   * Both are idempotent (see applyCancel), so the duplicate is a harmless no-op.
   */
  cancel(id: string): void {
    if (!this.applyCancel(id)) return; // already done/cancelled -> no-op

    // (1) Instant path: out-of-band over signaling.
    if (this.remoteId) this.signaling.signal(this.remoteId, { kind: "cancel", id });
    // (2) Legacy path: in-band over the data channel.
    const ch = this.channel;
    if (ch && ch.readyState === "open") this.send(ch, { t: "cancel", id });
  }

  /**
   * Idempotently mark a file cancelled and abort any in-flight send/receive for
   * it. Returns false (a no-op) if the item is unknown or already done/cancelled,
   * so a redundant in-band + out-of-band cancel is safe. Emits "cancelled" exactly
   * once (on the transition).
   */
  private applyCancel(id: string): boolean {
    const item = this.items.get(id);
    if (!item || item.status === "done" || item.status === "cancelled") return false;

    this.cancelledIds.add(id); // streamFile checks this per chunk to abort sends
    this.markStatus(id, "cancelled");

    // If we're the receiver and this is the active incoming file, drop it and
    // abort the sink so a partial file isn't left dangling on disk.
    if (this.incoming && this.incoming.item.id === id) {
      const inc = this.incoming;
      this.incoming = null;
      void inc.sink.abort();
      this.host.end(id);
    }

    this.emit("cancelled", { id });
    return true;
  }

  /**
   * The per-message send size for this connection: as large as the negotiated
   * SCTP limit allows, capped at our 256 KiB target and floored at 16 KiB.
   * pc.sctp / maxMessageSize is undefined until the transport is up (and absent
   * in the offline check stub) — we fall back to the target in that case.
   */
  private sendChunkSize(): number {
    const max = this.pc.sctp?.maxMessageSize;
    // maxMessageSize can be 0 / Infinity / undefined depending on the stack.
    const negotiated = typeof max === "number" && max > 0 && Number.isFinite(max) ? max : TARGET_SEND_CHUNK;
    return Math.max(MIN_SEND_CHUNK, Math.min(TARGET_SEND_CHUNK, negotiated));
  }

  /**
   * Pump one file's bytes through the channel. Returns false if cancelled
   * mid-flight.
   *
   * Speed: read the file in large READ_BLOCK (~4 MiB) gulps via
   * blob.arrayBuffer(), then ship each block as a run of sendChunk-sized
   * messages (capped to the negotiated SCTP maxMessageSize, ~256 KiB on
   * Chrome<->Chrome). This does ~one await per 4 MiB instead of one per 16 KiB,
   * and ~16x fewer SCTP messages, so the channel runs near the link rate.
   * bufferedAmount backpressure (SEND_HIGH_WATER) keeps memory bounded.
   */
  private async streamFile(ch: RTCDataChannel, file: File, item: TransferItem): Promise<boolean> {
    const sendChunk = this.sendChunkSize();
    let offset = 0;
    while (offset < file.size) {
      if (this.cancelledIds.has(item.id)) {
        this.cancelledIds.delete(item.id);
        return false;
      }

      // Read one large block, then slice it into sendChunk-sized SCTP messages.
      const block = await file.slice(offset, offset + READ_BLOCK).arrayBuffer();
      let pos = 0;
      while (pos < block.byteLength) {
        if (this.cancelledIds.has(item.id)) {
          this.cancelledIds.delete(item.id);
          return false;
        }
        // Backpressure: wait until the send buffer drains below the high-water
        // mark. Counts the chunk we're ABOUT to send, so we can never push
        // bufferedAmount toward the browser's hard cap and blow up send().
        while (ch.bufferedAmount + sendChunk > SEND_HIGH_WATER) {
          await this.waitForDrain(ch);
          if (ch.readyState !== "open") throw new Error("channel-closed-mid-send");
        }
        if (ch.readyState !== "open") throw new Error("channel-closed-mid-send");

        const end = Math.min(pos + sendChunk, block.byteLength);
        // slice() copies; fine and avoids retaining the whole 4 MiB block per send.
        ch.send(block.slice(pos, end));
        offset += end - pos;
        pos = end;
      }

      // Emit progress once per block (~4 MiB) rather than per chunk, to avoid
      // flooding the UI with re-renders while the bytes fly.
      item.transferred = offset;
      item.progress = Math.min(100, Math.round((offset / Math.max(1, file.size)) * 100));
      this.emit("transfer", { ...item });
    }
    return true;
  }

  /**
   * Wait for the send buffer to drain. ALSO resolves on channel close/error:
   * without that, a channel that dies mid-transfer never fires
   * `bufferedamountlow` and the pump parks forever — the "frozen at 40% with no
   * error" bug. On resolve the pump re-checks readyState and fails loudly.
   */
  private waitForDrain(ch: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        ch.removeEventListener("bufferedamountlow", done);
        ch.removeEventListener("close", done);
        ch.removeEventListener("error", done);
        resolve();
      };
      ch.addEventListener("bufferedamountlow", done);
      ch.addEventListener("close", done);
      ch.addEventListener("error", done);
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
        this.startIncoming(msg.id, msg.offset);
        break;
      }
      case "file-end": {
        this.finishIncoming(msg.id);
        break;
      }
      case "cancel": {
        // Remote cancelled this file (in-band path): drop the partial, mark
        // cancelled. Idempotent — a no-op if the out-of-band signaling cancel
        // already landed (or vice-versa).
        this.applyCancel(msg.id);
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

  /**
   * A file's chunks are about to arrive. The receive-item was created on accept.
   * If this file's batch was accepted with a disk target, open a writable now and
   * write chunks straight through (no Blob accumulation); otherwise accumulate in
   * memory exactly as before.
   */
  private startIncoming(id: string, offset = 0): void {
    if (this.cancelledIds.has(id)) return; // cancelled before bytes flowed
    const item = this.items.get(id);
    if (!item || item.direction !== "receive") return; // unaccepted / unknown -> ignore

    const key = this.incomingKeys.get(id) ?? `${item.name}:${item.size}`;
    const target = this.acceptTargets.get(item.batchId);
    const sink = this.host.begin(key, id, item, target);

    // Fable H2: the sender echoes the offset it will actually stream from. If that
    // disagrees with what we've DURABLY got, the prefixes don't line up — refuse to
    // append onto a mismatched partial (stale sender that restarted at 0, or a
    // wrong-file resume). For a fresh receive both are 0. Real resume: Task 5.
    if (offset !== sink.bytesWritten) {
      this.host.end(id);
      this.markStatus(id, "error");
      return;
    }

    this.incoming = { item, sink };
    item.status = "transferring";
    item.transferred = sink.bytesWritten;
    item.progress = Math.min(100, Math.round((item.transferred / Math.max(1, item.size)) * 100));
    this.emit("transfer", { ...item });
  }

  private onChunk(buf: ArrayBuffer): void {
    const inc = this.incoming;
    if (!inc) return; // no active incoming file (cancelled / not accepted)
    inc.sink.append(buf);
    // Durable count is the single source of truth (Fable H1): for disk it advances
    // as writes resolve, so progress is conservative, never ahead of what's on disk.
    inc.item.transferred = inc.sink.bytesWritten;
    inc.item.progress = Math.min(
      100,
      Math.round((inc.item.transferred / Math.max(1, inc.item.size)) * 100),
    );
    this.emit("transfer", { ...inc.item });
  }

  /**
   * The active incoming file finished.
   *   - In-memory mode: build ONE Blob, attach it (item.blob), emit "file-received"
   *     with the blob. NOTHING auto-saves — the UI downloads on demand.
   *   - Disk mode: flush + close the writable (bytes already on disk), emit
   *     "file-received" with savedToDisk:true and NO blob.
   *
   * ponytail: in-memory received files live in RAM (item.blob) until the user
   * downloads or the session ends — RAM ceiling = sum of in-memory file sizes.
   * Large transfers use the disk path and never touch that ceiling.
   */
  private finishIncoming(id: string): void {
    const inc = this.incoming;
    if (!inc || inc.item.id !== id) return;
    this.incoming = null;
    void this.completeIncoming(id, inc);
  }

  /**
   * Flush the sink, verify the DURABLE byte count matches the manifest EXACTLY
   * (Fable H1/H2: an over- OR under-count, or a poisoned sink, must fail — never
   * fake "done"), then emit file-received. Memory → a Blob; disk → savedToDisk
   * with no blob (bytes already on disk).
   */
  private async completeIncoming(id: string, inc: IncomingState): Promise<void> {
    await inc.sink.quiesce();
    const bytes = inc.sink.bytesWritten;
    if (bytes !== inc.item.size || inc.sink.failed) {
      await inc.sink.abort();
      this.host.end(id);
      this.markStatus(id, "error");
      return;
    }

    const blob = await inc.sink.finalize(); // memory -> Blob; disk -> null (writable closed)
    const savedName = this.host.savedName(id);
    this.host.end(id);
    if (this.disposed) return;

    inc.item.status = "done";
    inc.item.transferred = inc.item.size;
    inc.item.progress = 100;
    if (blob) {
      inc.item.blob = blob;
      this.emit("transfer", { ...inc.item });
      this.emit("file-received", { id, name: inc.item.name, mime: inc.item.mime, blob });
    } else {
      inc.item.savedToDisk = true;
      if (savedName) inc.item.name = savedName;
      this.emit("transfer", { ...inc.item });
      this.emit("file-received", { id, name: inc.item.name, mime: inc.item.mime, savedToDisk: true });
    }
  }

  // ---- teardown ------------------------------------------------------------

  close(): void {
    this.disposed = true;
    this.clearRestartTimer();
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
