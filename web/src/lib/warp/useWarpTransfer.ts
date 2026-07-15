/**
 * React hook orchestrating a Wrap transfer: signaling socket, the WebRTC peers,
 * and the symmetric file-transfer tray. Both sender and receiver use this hook —
 * pass `joinCode` to act as the receiver who joins an existing room.
 *
 * Multi-device mesh:
 *   A room can hold several devices (the server allows up to 8). We keep ONE
 *   `WarpPeer` per remote device in a Map, and every device is connected to
 *   every other (full mesh). Each `WarpPeer` is per-remote and already self-
 *   contained — it emits transfer/incoming-offer/file-received/etc. events — so
 *   the hook just FANS OUT (send to all) and STAMPS each event with the peer it
 *   came from (`item.peerId`, `incoming.peerId`).
 *
 * Roles & glare avoidance (see peer.ts): whoever JOINS a room and receives a
 * non-empty `peers` list is the initiator and offers to EACH existing peer. A
 * device already in the room is the responder for each later `peer-joined` and
 * waits for the incoming offer.
 *
 * Review-before-receive: the channels STAY OPEN after a batch. Status reaches
 * "connected" once at least one peer's data channel is open and stays there.
 * Either side can offer files or send text repeatedly. Received files land in
 * `items[]` as in-memory blobs; the UI downloads them on demand. An incoming
 * `offer` is surfaced via `incoming` (tagged with its peerId) until accept/decline.
 *
 * The single-device case is unchanged in behaviour: one peer in the map, fan-out
 * targets exactly that peer, and `incoming`/`accept`/`decline` work as before.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zipSync, type Zippable } from "fflate";
import { SignalingClient, type SignalData } from "./signaling";
import {
  WarpPeer,
  type AcceptTarget,
  type FsDirHandle,
  type FsFileHandle,
  type PeerErrorKind,
  type ReceiveHost,
} from "./peer";
import { diskSink, memorySink, type ReceiveSink } from "./receiveController";
import { estimateFits, gcOrphanStaging, idbSink } from "./idbStage";
import { formatBytes, type OfferItem, type TransferItem } from "./transfer";

/**
 * One in-flight (or paused) incoming file's durable state, owned by the HOOK
 * (not the peer) so it SURVIVES a peer rebuild on reconnect — the key to resume.
 * Keyed by the file's stable `key`. `sink.bytesWritten` is the resume offset.
 */
interface RxEntry {
  key: string;
  size: number;
  /** The sender's token; a re-offer must present the same one to auto-resume (H5). */
  resumeToken: string;
  sink: ReceiveSink;
  /** Disk target for this file (absent = in-memory). */
  target?: AcceptTarget;
  /** True while a peer is actively receiving into it. A drop sets it false. */
  active: boolean;
  /** Which peer currently owns writes (H4): a chunk from a non-owner is dropped. */
  ownerToken?: string;
  /** On-disk name chosen (disk mode). */
  savedName?: string;
}

/**
 * At/above this many bytes (256 MiB) — total batch OR any single file — we stream
 * accepted files STRAIGHT TO DISK via the File System Access API instead of
 * accumulating an in-memory Blob (which would crash the tab on a multi-GB game).
 * Below it we keep the small-file in-memory tray (so we never reintroduce the
 * "1000 save prompts" problem). See `accept()`.
 */
const LARGE_THRESHOLD = 256 * 1024 * 1024;

/**
 * Minimal File System Access API surface the hook calls. `lib.dom` here doesn't
 * include these (they're experimental), so we declare just the two pickers we
 * use. Their return types are structurally compatible with peer.ts's FsFileHandle
 * / FsDirHandle, so the handles pass straight through as an AcceptTarget.
 */
interface ShowSaveFilePickerOptions {
  suggestedName?: string;
}
interface WindowWithFsPickers {
  showSaveFilePicker?: (opts?: ShowSaveFilePickerOptions) => Promise<FsFileHandle>;
  showDirectoryPicker?: () => Promise<FsDirHandle>;
}

export type WarpMode = "send" | "receive";

export type WarpStatus =
  | "idle" // nothing started yet
  | "connecting" // socket opening / joining room
  | "waiting" // in a room, waiting for the other side
  | "connected" // at least one data channel open — both peers can keep sending
  | "reconnecting" // transport dropped mid-session; recovery in progress
  | "error";

/** A pending inbound batch manifest awaiting the user's accept/decline. */
export interface IncomingOffer {
  batchId: string;
  items: OfferItem[];
  /** Which remote device this offer came from (mesh-aware). */
  peerId: string;
}

/** A connected (or connecting) device in the room, for the UI's device list. */
export interface Connection {
  /** Remote device id (stable signaling id; used to route sends). */
  peerId: string;
  /** Short human label derived from the id (first 8 chars). */
  label: string;
  /** True once this device's data channel is open. */
  connected: boolean;
}

export interface WarpError {
  kind: PeerErrorKind | "signaling" | "no-files" | "too-large";
  message: string;
}

export interface UseWarpTransfer {
  mode: WarpMode;
  code: string | null;
  shareUrl: string | null;
  /** Raw remote peer ids in the room (kept for back-compat with existing UI). */
  peers: string[];
  /** Devices in the room with their labels + per-device connection state. */
  connections: Connection[];
  status: WarpStatus;
  /** The session tray: every item we've sent or received, both directions.
   *  Each item carries `peerId` (which device it is to/from) in a mesh room. */
  items: TransferItem[];
  /** A pending offer from a peer awaiting accept/decline (tagged peerId), or null. */
  incoming: IncomingOffer | null;
  error: WarpError | null;
  /** Sender: open a fresh room and wait for peers. */
  createRoom: () => void;
  /** Offer files to EVERY connected device (each gated by that device's accept).
   *  Safe to call repeatedly. Before anyone is connected, files are staged and
   *  offered to each device as its channel comes up. */
  sendFiles: (files: File[]) => Promise<void>;
  /** Send a text snippet to every connected device (appears in their tray). */
  sendText: (text: string) => void;
  /**
   * Accept the pending incoming offer -> bytes flow from that device. For a LARGE
   * batch (total or any single file >= 256 MiB) on a browser with the File System
   * Access API, this prompts a save-location picker FROM THE ACCEPT GESTURE and
   * streams straight to disk (those items land as `savedToDisk`, no in-memory
   * blob). Small batches — or a cancelled picker / unsupported browser — accept
   * in-memory as before. Async because the picker is awaited.
   */
  accept: () => Promise<void>;
  /** Decline the pending incoming offer -> nothing is received from that device. */
  decline: () => void;
  /** Cancel an in-flight item (either direction) by id — routed to its peer. */
  cancel: (id: string) => void;
  /** Save one received file's blob to disk via an anchor download. */
  downloadOne: (id: string) => void;
  /** Zip all received, done file-items into warp-files.zip and download it. */
  downloadAll: () => void;
  /** Re-attempt after a failure (tears down and restarts the same role). */
  retry: () => void;
}

const ERROR_MESSAGES: Record<WarpError["kind"], string> = {
  "nat-failed": "Couldn't open a direct path between the devices. One side may be on a restrictive network.",
  disconnected:
    "The connection dropped and couldn't be restored. Retry to reconnect — unfinished files will be offered again.",
  "channel-error": "The data channel hit an error.",
  signaling: "Lost contact with the signaling server.",
  "no-files": "Add at least one file before opening a channel.",
  "too-large": "This device can't receive a file this large. Try a desktop browser (Chrome/Edge).",
};

/** How long "reconnecting" may last before we surface an honest failure. */
const RECONNECT_WATCHDOG_MS = 25_000;

/** Short, stable label for a remote device id. */
function labelFor(peerId: string): string {
  return peerId.slice(0, 8);
}

/** De-dupe a filename within a folder target: "a.txt", "a (1).txt", … */
function uniqueName(used: Set<string>, name: string): string {
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

/** Trigger a browser download of a blob via a transient object-URL anchor. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useWarpTransfer(joinCode?: string): UseWarpTransfer {
  const mode: WarpMode = joinCode ? "receive" : "send";

  const [code, setCode] = useState<string | null>(joinCode ?? null);
  const [peers, setPeers] = useState<string[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [status, setStatus] = useState<WarpStatus>("idle");
  const [items, setItems] = useState<TransferItem[]>([]);
  const [incoming, setIncoming] = useState<IncomingOffer | null>(null);
  const [error, setError] = useState<WarpError | null>(null);

  const signalingRef = useRef<SignalingClient | null>(null);
  /** One WarpPeer per remote device id (full mesh). */
  const peersRef = useRef<Map<string, WarpPeer>>(new Map());
  /** Files staged by the sender to offer each peer the moment its channel opens. */
  const pendingFilesRef = useRef<File[] | null>(null);
  /** Every File handed to sendFiles this session — the pool salvage draws on to
   *  rebuild a re-offer after a dropped connection (matched by name+size). */
  const allFilesRef = useRef<File[]>([]);
  /** Durable receive state keyed by file identity, surviving peer rebuilds (resume). */
  const receiveRegRef = useRef<Map<string, RxEntry>>(new Map());
  /** Keys the user explicitly cancelled — a re-offer of these must NOT auto-resume. */
  const cancelledKeysRef = useRef<Set<string>>(new Set());
  /** Receive item id -> file key, so cancel(id) can find & poison the right entry. */
  const rxIdKeyRef = useRef<Map<string, string>>(new Map());
  /** Ref mirrors so long-lived peer event listeners never read stale state. */
  const itemsRef = useRef<TransferItem[]>([]);
  const peersListRef = useRef<string[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    peersListRef.current = peers;
  }, [peers]);

  const shareUrl = useMemo(
    () => (code ? `${window.location.origin}/r/${code}` : null),
    [code],
  );

  const fail = useCallback((kind: WarpError["kind"], message?: string) => {
    setError({ kind, message: message ?? ERROR_MESSAGES[kind] });
    setStatus("error");
  }, []);

  /** Merge a transfer item update into state by id (preserves order). */
  const upsertItem = useCallback((item: TransferItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((t) => t.id === item.id);
      if (idx === -1) return [...prev, item];
      const next = prev.slice();
      next[idx] = item;
      return next;
    });
  }, []);

  /** Recompute the connections list from the live peer map. */
  const refreshConnections = useCallback(() => {
    setConnections(
      Array.from(peersRef.current.entries()).map(([peerId, peer]) => ({
        peerId,
        label: labelFor(peerId),
        connected: peer.isConnected,
      })),
    );
  }, []);

  /** Every peer whose data channel is currently open. */
  const connectedPeers = useCallback((): WarpPeer[] => {
    return Array.from(peersRef.current.values()).filter((p) => p.isConnected);
  }, []);

  /** Salvage-and-rebuild for a dead peer; assigned below (breaks the
   *  bindPeer <-> salvagePeer <-> addInitiator callback cycle). */
  const salvageRef = useRef<(peerId: string) => void>(() => {});
  /** Late-bound self-reference so connect's own handlers can re-connect. */
  const connectRef = useRef<(room?: string) => void>(() => {});

  /**
   * A ReceiveHost bound to one peer, backed by the hook-owned registry. `begin`
   * reuses a pre-created entry (so a resumed file keeps its partial); the peerId is
   * the owner token so a zombie peer's late chunks are dropped (Fable H4).
   */
  const makeHost = useCallback((peerId: string): ReceiveHost => {
    const idKey = new Map<string, string>();
    const reg = receiveRegRef.current;
    return {
      begin(key, id, item, target) {
        idKey.set(id, key);
        rxIdKeyRef.current.set(id, key);
        let e = reg.get(key);
        if (!e) {
          // No entry pre-created by accept() (safety) — default to in-memory.
          e = { key, size: item.size, resumeToken: "", sink: memorySink(item.mime), target, active: false };
          reg.set(key, e);
        }
        e.active = true;
        e.ownerToken = peerId;
        return e.sink;
      },
      get(id) {
        const key = idKey.get(id);
        const e = key ? reg.get(key) : undefined;
        if (!e || e.ownerToken !== peerId) return undefined; // H4: only the owner writes
        return e.sink;
      },
      savedName(id) {
        const key = idKey.get(id);
        return key ? reg.get(key)?.savedName : undefined;
      },
      end(id) {
        const key = idKey.get(id);
        idKey.delete(id);
        if (key) reg.delete(key); // completion or cancel -> drop the durable entry
      },
    };
  }, []);

  /**
   * Decide what to do with an inbound offer (Fable H3/H5/M1/M2): if EVERY item is a
   * known in-progress file — its key is in the registry, not active, token matches,
   * and it wasn't cancelled — auto-accept it with each file's durable resume offset
   * and NO modal. Otherwise surface the accept modal. Duplicate keys in one batch
   * disable resume (force the modal).
   */
  const handleIncomingOffer = useCallback(
    (peerId: string, info: { batchId: string; items: OfferItem[] }) => {
      const reg = receiveRegRef.current;
      const keys = info.items.map((i) => i.key);
      const dupKeys = new Set(keys).size !== keys.length;
      const allResumable =
        !dupKeys &&
        info.items.length > 0 &&
        info.items.every((it) => {
          const e = it.key ? reg.get(it.key) : undefined;
          return (
            !!e &&
            !e.active &&
            !!it.resumeToken &&
            e.resumeToken === it.resumeToken &&
            !cancelledKeysRef.current.has(it.key!)
          );
        });

      if (!allResumable) {
        setIncoming({ ...info, peerId });
        return;
      }

      // Auto-resume: report each file's DURABLE byte count as its offset (H1).
      const peer = peersRef.current.get(peerId);
      if (!peer) return;
      void (async () => {
        const resume: Record<string, number> = {};
        let target: AcceptTarget | undefined;
        for (const it of info.items) {
          const e = reg.get(it.key!)!;
          await e.sink.quiesce();
          resume[it.id] = e.sink.bytesWritten;
          rxIdKeyRef.current.set(it.id, it.key!);
          if (!target) target = e.target;
        }
        peer.acceptOffer(info.batchId, target, resume);
      })();
    },
    [],
  );

  /** Wire one per-remote peer's events into hook state, stamping its peerId. */
  const bindPeer = useCallback(
    (peerId: string, peer: WarpPeer) => {
      peer.on("connected", () => {
        // Any open channel means the session is live — even from a terminal
        // error screen (a device coming back late self-heals the session).
        setError(null);
        setStatus("connected");
        refreshConnections();
        // Sender auto-offers any staged files to THIS peer as it comes up.
        // A failed offer is NOT terminal: the files stay staged for the next
        // channel (salvage/reconnect re-offers them).
        const files = pendingFilesRef.current;
        if (files && files.length) {
          peer.offerFiles(files).catch(() => {});
        }
      });

      // Transport wobble: show "reconnecting" only when no channel is left
      // carrying bytes; flip back the moment the transport recovers.
      peer.on("reconnecting", () => {
        if (!connectedPeers().length) {
          setStatus((s) => (s === "connected" ? "reconnecting" : s));
        }
      });
      peer.on("recovered", () => {
        setError(null);
        setStatus("connected");
        refreshConnections();
      });

      // Both directions: an item was created or its progress changed. Stamp the
      // device it belongs to so the UI can tag tray rows / route cancels.
      peer.on("transfer", (item) => upsertItem({ ...item, peerId }));

      // A whole manifest arrived from THIS peer — auto-resume a known in-progress
      // file (no modal), else surface the accept modal.
      peer.on("incoming-offer", (info) => handleIncomingOffer(peerId, info));

      // file-received / text-received are already covered by the `transfer`
      // emit (which stamps peerId), so nothing extra to do here.
      peer.on("file-received", () => {});
      peer.on("text-received", () => {});
      peer.on("declined", () => {});
      peer.on("cancelled", () => {});

      peer.on("error", (kind) => {
        // A mid-session transport death is salvageable: rebuild the link and
        // automatically re-offer whatever didn't finish. Only a genuine
        // could-never-connect ("nat-failed") is terminal on the spot.
        if (kind === "disconnected" || kind === "channel-error") {
          salvageRef.current(peerId);
          return;
        }
        fail(kind);
      });
    },
    [fail, upsertItem, refreshConnections, connectedPeers, handleIncomingOffer],
  );

  /** Create + register an initiator peer for an existing device and offer to it. */
  const addInitiator = useCallback(
    (sig: SignalingClient, peerId: string) => {
      if (peersRef.current.has(peerId)) return;
      const peer = new WarpPeer(sig, peerId, true, makeHost(peerId));
      peersRef.current.set(peerId, peer);
      bindPeer(peerId, peer);
      refreshConnections();
      peer.start().catch(() => fail("channel-error"));
    },
    [bindPeer, refreshConnections, fail, makeHost],
  );

  /** Create + register a responder peer that waits for `peerId`'s incoming offer. */
  const addResponder = useCallback(
    (sig: SignalingClient, peerId: string) => {
      if (peersRef.current.has(peerId)) return peersRef.current.get(peerId)!;
      const peer = new WarpPeer(sig, peerId, false, makeHost(peerId));
      peersRef.current.set(peerId, peer);
      bindPeer(peerId, peer);
      refreshConnections();
      return peer;
    },
    [bindPeer, refreshConnections, makeHost],
  );

  /** Establish the signaling socket and the join/role dance for a full mesh. */
  const connect = useCallback(
    (roomCode: string | undefined) => {
      // Tear down any prior session (all peers).
      for (const p of peersRef.current.values()) p.close();
      peersRef.current.clear();
      signalingRef.current?.close();
      setItems([]);
      setIncoming(null);
      setError(null);
      setConnections([]);
      setStatus("connecting");

      const sig = new SignalingClient();
      signalingRef.current = sig;

      sig.on("joined", ({ room, peers: existing }) => {
        setCode(room); // the server's real, joinable code — not a locally-minted one
        setPeers(existing);
        if (existing.length > 0) {
          // We're the new (or REJOINING) device -> initiator to every existing
          // device we don't already hold a LIVE channel to. A healthy channel
          // that survived a signaling blip is kept untouched; a dead entry is
          // replaced with a fresh handshake.
          for (const peerId of existing) {
            const cur = peersRef.current.get(peerId);
            if (cur && cur.isConnected) continue;
            if (cur) {
              cur.close();
              peersRef.current.delete(peerId);
            }
            addInitiator(sig, peerId);
          }
          // Devices that vanished while we were away: prune their dead peers.
          for (const [id, p] of peersRef.current) {
            if (!existing.includes(id) && !p.isConnected) {
              p.close();
              peersRef.current.delete(id);
            }
          }
          refreshConnections();
        } else {
          // Empty room: wait for someone to join.
          setStatus("waiting");
        }
      });

      sig.on("peer-joined", (peerId) => {
        setPeers((p) => (p.includes(peerId) ? p : [...p, peerId]));
        // We were here first -> responder. The WarpPeer is created LAZILY when
        // its first signal frame arrives (see the "signal" handler), so a device
        // that joins but never handshakes doesn't leave a ghost entry.
      });

      sig.on("peer-left", (peerId) => {
        setPeers((p) => p.filter((x) => x !== peerId));
        const peer = peersRef.current.get(peerId);
        // KEEP a peer whose data channel is still open: signaling is only the
        // handshake plane — bytes keep flowing without it (the old code killed
        // healthy mid-transfer sessions here whenever a socket blipped). If the
        // transport later dies too, the peer's own error event salvages it.
        if (peer && !peer.isConnected) {
          peer.close();
          peersRef.current.delete(peerId);
          // Clear a pending offer that came from the device that just left.
          setIncoming((off) => (off && off.peerId === peerId ? null : off));
        }
        refreshConnections();
      });

      sig.on("signal", ({ from, data }: { from: string; data: SignalData }) => {
        // A responder may receive its first offer before `peer-joined` was
        // processed into a WarpPeer; lazily construct one for `from`.
        const peer = peersRef.current.get(from) ?? addResponder(sig, from);
        peer.handleSignal(from, data).catch(() => fail("channel-error"));
      });

      sig.on("error", (err: string) => {
        // Our own room evaporated while our socket was down (we were its only
        // member). Sender with no live channels: mint a fresh room and keep
        // going — the code/QR on screen simply updates.
        if (err === "room-not-found" && mode === "send" && !connectedPeers().length) {
          connectRef.current(undefined);
          return;
        }
        const map: Record<string, string> = {
          "room-not-found": "That room is no longer open — ask the sender for a fresh link.",
          "room-full": "That room is full (up to 8 devices).",
          "bad-room": "That room code looks invalid.",
          "signaling-lost": "Lost contact with the signaling server — check your connection and retry.",
        };
        fail("signaling", map[err]);
      });

      sig.connect(roomCode);
    },
    [addInitiator, addResponder, refreshConnections, fail, mode, connectedPeers],
  );
  connectRef.current = connect;

  const createRoom = useCallback(() => {
    // The server owns room codes. Connect with NO room so it creates one and
    // returns the real, joinable code in `joined`. (Locally-minted "WRAP-…"
    // codes were rejected by the server's validator — that broke every transfer.)
    setCode(null);
    connect(undefined);
  }, [connect]);

  /**
   * A peer's transport died for good (channel closed / restarts exhausted).
   * Instead of a terminal error: tear that peer down, re-stage its unfinished
   * outgoing files for an automatic re-offer, drop the dead tray rows, show
   * "reconnecting" (bounded by the watchdog), and — if the device's socket is
   * still in the room (only ICE died) — rebuild the link immediately.
   */
  const salvagePeer = useCallback(
    (peerId: string) => {
      const peer = peersRef.current.get(peerId);
      if (peer) {
        peer.close();
        peersRef.current.delete(peerId);
      }
      setIncoming((off) => (off && off.peerId === peerId ? null : off));

      // KEEP the durable receive partials owned by the dead peer, just mark them
      // inactive so the re-offer after reconnect auto-resumes them (don't close the
      // disk writable — that's the whole point of hoisting it into the hook).
      for (const e of receiveRegRef.current.values()) {
        if (e.ownerToken === peerId) e.active = false;
      }

      const unfinished = itemsRef.current.filter(
        (t) =>
          t.peerId === peerId &&
          t.kind === "file" &&
          t.status !== "done" &&
          t.status !== "declined" &&
          t.status !== "cancelled",
      );

      // Sender side: put the Files behind unfinished sends back on the staging
      // pad — the existing staged-files path auto-offers them to the next
      // channel that opens (the same device coming back, in the 1-to-1 case).
      // ponytail: files restart from byte 0 on re-offer; add offset resume if
      // interrupted multi-GB transfers ever hurt. Matched by name+size.
      const pool = [...allFilesRef.current];
      const files: File[] = [];
      for (const t of unfinished) {
        if (t.direction !== "send") continue;
        const i = pool.findIndex((f) => f.name === t.name && f.size === t.size);
        if (i !== -1) files.push(pool.splice(i, 1)[0]);
      }
      if (files.length) {
        pendingFilesRef.current = files;
        // The device may ALREADY be back (a reload races: its new channel can
        // open before the old one's death is detected). The staged-files offer
        // in the `connected` handler has already fired in that case, so offer
        // to every currently open channel right now as well (idempotent-ish:
        // each offer is accept-gated on the receiving side).
        for (const p of connectedPeers()) p.offerFiles(files).catch(() => {});
      }

      // Drop the dead rows — the automatic re-offer recreates them fresh.
      const gone = new Set(unfinished.map((t) => t.id));
      if (gone.size) setItems((prev) => prev.filter((t) => !gone.has(t.id)));
      refreshConnections();

      if (!connectedPeers().length) {
        setStatus((s) => (s === "error" ? s : "reconnecting"));
      }

      // Device still in the room (its socket outlived the transport)? Rebuild
      // now. Deterministic initiator — the lexicographically smaller id offers —
      // so both sides don't offer at once; the other side responds lazily.
      const sig = signalingRef.current;
      if (sig && sig.selfId && peersListRef.current.includes(peerId) && sig.selfId < peerId) {
        addInitiator(sig, peerId);
      }
    },
    [refreshConnections, connectedPeers, addInitiator],
  );
  salvageRef.current = salvagePeer;

  const sendFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) {
        fail("no-files");
        return;
      }
      // Remember every File this session so an interrupted transfer can be
      // salvaged into an automatic re-offer after a reconnect.
      allFilesRef.current.push(...files);
      const open = connectedPeers();
      if (open.length) {
        // Fan out: offer the same batch to every connected device. Each offer is
        // an independent per-peer accept/stream. If the channel dies under us,
        // stage the files instead of failing — the reconnect path re-offers.
        try {
          await Promise.all(open.map((p) => p.offerFiles(files)));
        } catch {
          pendingFilesRef.current = files;
        }
      } else {
        // Nobody connected yet: stage for each peer's `connected` handler to offer.
        pendingFilesRef.current = files;
      }
    },
    [fail, connectedPeers],
  );

  const sendText = useCallback(
    (text: string) => {
      if (!text) return;
      const open = connectedPeers();
      if (!open.length) return;
      try {
        for (const p of open) p.sendText(text);
      } catch {
        fail("channel-error");
      }
    },
    [fail, connectedPeers],
  );

  const accept = useCallback(async () => {
    const off = incoming;
    if (!off) return;
    const peer = peersRef.current.get(off.peerId);
    if (!peer) {
      setIncoming(null);
      return;
    }

    // Decide the strategy from the offer manifest: a batch is "large" if its
    // total OR any single file is >= 256 MiB. Large + FS Access API => stream to
    // disk (prompt a folder for many files, else a single save target); anything
    // else stays in the in-memory tray.
    const total = off.items.reduce((s, it) => s + it.size, 0);
    const biggest = off.items.reduce((m, it) => Math.max(m, it.size), 0);
    const large = total >= LARGE_THRESHOLD || biggest >= LARGE_THRESHOLD;
    const fs = window as unknown as WindowWithFsPickers;
    const canStream = large && (off.items.length > 1 ? !!fs.showDirectoryPicker : !!fs.showSaveFilePicker);

    let target: AcceptTarget | undefined;
    if (canStream) {
      // Prompt FROM the accept user-gesture (we haven't awaited anything yet).
      // If the user dismisses the picker (AbortError) we fall back to in-memory.
      try {
        if (off.items.length > 1) {
          const dirHandle = await fs.showDirectoryPicker!();
          target = { dirHandle };
        } else {
          const fileHandle = await fs.showSaveFilePicker!({ suggestedName: off.items[0]?.name });
          target = { fileHandle };
        }
      } catch {
        target = undefined; // picker cancelled -> in-memory fallback
      }
    }

    // Large but NO disk target (no FS Access API, or the picker was cancelled): fall
    // back to IndexedDB staging — but GATE it so we don't OOM-crash the tab. If the
    // device genuinely can't hold it (iOS memory ceiling / no storage room), refuse
    // honestly (decline the offer) instead of crashing (Fable M3/M4).
    let useIdb = false;
    if (large && !target) {
      const fit = await estimateFits(total);
      if (!fit.ok) {
        setIncoming(null);
        peer.declineOffer(off.batchId);
        fail("too-large", fit.reason);
        return;
      }
      useIdb = true;
    }

    // Build a durable registry entry + sink per file BEFORE accepting, so the
    // received bytes live in a place the HOOK owns and thus survive a peer rebuild
    // on reconnect (the key to resume). Disk => stream to the chosen target (names
    // de-duped within a folder); otherwise accumulate in memory.
    const usedNames = new Set<string>();
    for (const it of off.items) {
      if (!it.key) continue;
      let sink: ReceiveSink;
      let savedName: string | undefined;
      if (target && "dirHandle" in target) {
        savedName = uniqueName(usedNames, it.name);
        const dir = target.dirHandle;
        const name = savedName;
        sink = diskSink(async () => (await dir.getFileHandle(name, { create: true })).createWritable());
      } else if (target && "fileHandle" in target) {
        savedName = target.fileHandle.name || it.name;
        const fh = target.fileHandle;
        sink = diskSink(async () => fh.createWritable());
      } else if (useIdb) {
        sink = idbSink(it.id, it.mime); // large, no FS Access -> IDB staging (bounded RAM)
      } else {
        sink = memorySink(it.mime);
      }
      receiveRegRef.current.set(it.key, {
        key: it.key,
        size: it.size,
        resumeToken: it.resumeToken ?? "",
        sink,
        target,
        active: false,
        savedName,
      });
      rxIdKeyRef.current.set(it.id, it.key);
    }

    // Clear the modal only after the picker settles, so a cancelled picker can
    // still fall through to an in-memory accept of the same offer.
    setIncoming(null);
    peer.acceptOffer(off.batchId, target);
  }, [incoming]);

  const decline = useCallback(() => {
    const off = incoming;
    if (!off) return;
    setIncoming(null);
    peersRef.current.get(off.peerId)?.declineOffer(off.batchId);
  }, [incoming]);

  const cancel = useCallback(
    (id: string) => {
      // Remember the cancelled file's key + drop its durable entry, so a later
      // re-offer of that key surfaces the modal instead of auto-resurrecting a file
      // the user explicitly killed (Fable M2).
      const key = rxIdKeyRef.current.get(id);
      if (key) {
        cancelledKeysRef.current.add(key);
        const e = receiveRegRef.current.get(key);
        if (e) void e.sink.abort();
        receiveRegRef.current.delete(key);
      }

      // Route to the peer that owns the item; the item carries its peerId.
      const item = items.find((t) => t.id === id);
      const peer = item?.peerId ? peersRef.current.get(item.peerId) : undefined;
      if (peer) {
        peer.cancel(id);
        return;
      }
      // Fallback (e.g. peerId not yet stamped): try every peer; the wrong ones
      // no-op because they don't own the id.
      for (const p of peersRef.current.values()) p.cancel(id);
    },
    [items],
  );

  const downloadOne = useCallback(
    (id: string) => {
      const item = items.find((t) => t.id === id);
      // savedToDisk items are already on disk (no blob) -> nothing to download.
      if (!item || item.savedToDisk || !item.blob) return;
      saveBlob(item.blob, item.name);
    },
    [items],
  );

  const downloadAll = useCallback(() => {
    // Zip every received, done file-item that still has its blob in memory.
    // savedToDisk items are already on disk (no blob) and are skipped here.
    const received = items.filter(
      (t) =>
        t.direction === "receive" &&
        t.kind === "file" &&
        t.status === "done" &&
        !t.savedToDisk &&
        t.blob,
    );
    if (!received.length) return;

    const zippable: Zippable = {};
    const used = new Set<string>();
    Promise.all(
      received.map(async (t) => {
        // De-dupe identical filenames so the zip doesn't clobber entries.
        let name = t.name || "file";
        if (used.has(name)) {
          const dot = name.lastIndexOf(".");
          const base = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : "";
          let n = 2;
          while (used.has(`${base} (${n})${ext}`)) n += 1;
          name = `${base} (${n})${ext}`;
        }
        used.add(name);
        const buf = new Uint8Array(await t.blob!.arrayBuffer());
        zippable[name] = buf;
      }),
    )
      .then(() => {
        const zipped = zipSync(zippable, { level: 0 }); // level 0: files are usually already compressed
        saveBlob(new Blob([zipped], { type: "application/zip" }), "warp-files.zip");
      })
      .catch(() => fail("channel-error"));
  }, [items, fail]);

  const retry = useCallback(() => {
    // NOTE: pendingFilesRef is deliberately KEPT — after a mid-transfer failure
    // it holds the salvaged unfinished files, and retry's whole point is to
    // reconnect and re-offer them automatically.
    if (mode === "receive" && joinCode) {
      setCode(joinCode);
      connect(joinCode);
    } else if (code) {
      connect(code);
    } else {
      createRoom();
    }
  }, [mode, joinCode, code, connect, createRoom]);

  // Watchdog: a mid-transfer drop must NEVER hard-fail while there's something to
  // resume — signaling now retries for the life of the tab and the partials are
  // durable, so we stay "reconnecting" (the banner tells the user it'll resume).
  // Only when there is nothing unfinished to preserve do we surface an honest,
  // retryable failure after the window. Any channel opening self-heals either way.
  useEffect(() => {
    if (status !== "reconnecting") return;
    const t = setTimeout(() => {
      const resumable = itemsRef.current.some(
        (it) =>
          it.kind === "file" &&
          (it.status === "transferring" || it.status === "reconnecting" || it.status === "offered"),
      );
      if (!resumable) fail("disconnected");
    }, RECONNECT_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [status, fail]);

  // Keep the screen awake while bytes are in flight — a phone locking its
  // screen mid-transfer suspends the tab and kills the transport, which was
  // the #1 way big transfers died at 40%. Best-effort (absent API = no-op);
  // re-acquired when the tab becomes visible again (the OS releases it on hide).
  const transferring = items.some((t) => t.status === "transferring");
  useEffect(() => {
    if (!transferring) return;
    type WakeSentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeSentinel> };
    };
    if (!nav.wakeLock) return;
    let sentinel: WakeSentinel | null = null;
    let done = false;
    const acquire = () => {
      nav
        .wakeLock!.request("screen")
        .then((s) => {
          if (done) void s.release().catch(() => {});
          else sentinel = s;
        })
        .catch(() => {}); // denied (background tab / power saver) — best-effort
    };
    acquire();
    const onVis = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", onVis);
      void sentinel?.release().catch(() => {});
    };
  }, [transferring]);

  // Prune abandoned IDB staging rows from crashed sessions once on mount (best-effort).
  useEffect(() => {
    void gcOrphanStaging();
  }, []);

  // Receiver: auto-join the room from the URL on mount.
  useEffect(() => {
    if (joinCode) connect(joinCode);
    return () => {
      for (const p of peersRef.current.values()) p.close();
      peersRef.current.clear();
      signalingRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCode]);

  return {
    mode,
    code,
    shareUrl,
    peers,
    connections,
    status,
    items,
    incoming,
    error,
    createRoom,
    sendFiles,
    sendText,
    accept,
    decline,
    cancel,
    downloadOne,
    downloadAll,
    retry,
  };
}

// ponytail: `formatBytes` is re-exported for the UI's convenience so it doesn't
// re-derive the size formatter; if unused by the UI this line can be dropped.
export { formatBytes };
