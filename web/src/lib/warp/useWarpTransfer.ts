/**
 * React hook orchestrating a Warp transfer: signaling socket, the WebRTC peers,
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
import { estimateFits, gcOrphanStaging, idbDurableLength, idbSink, storageFits } from "./idbStage";
import { gcOrphanOpfs, opfsDurableLength, opfsSink, opfsSinkWithIdbFallback, opfsSupported } from "./opfsStage";
import { gcRxLedger, putRxLedger, readRxLedger, removeRxLedger, type LedgerSinkKind } from "./rxLedger";
import { chooseReceiveStrategy, detectFsAccessSupport, isLargeBatch } from "./receiveStrategy";
import { supportedCodecs } from "./compress";
import { streamZipDownload } from "./zipDownload";
import { formatBytes, type OfferItem, type TransferItem } from "./transfer";
import { SpeedTracker } from "./transferStats";
import { guardTargetFor } from "./receiveGuards";

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
  /**
   * Durable coordinates for reload-resume (issue #36), present only for the
   * origin-storage sinks whose staged bytes SURVIVE a tab reload (IDB today; OPFS
   * recorded for forward-compat). `fileId` is the staging name the sink used, so a
   * reload reconstructs the SAME sink over the SAME bytes; the ledger row this
   * feeds is written on durable progress and read back at mount to repopulate the
   * registry. Absent for memory / disk sinks (they can't reload-resume here).
   */
  ledger?: { fileId: string; sinkKind: LedgerSinkKind; mime: string; name: string };
}

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

/**
 * Live throughput readout for the session, computed CLIENT-SIDE from the items'
 * progress (the signaling relay never sees a byte). Aggregated across every
 * in-flight file, both directions — in a mesh room several files may move at
 * once, so the figure is the sum of their throughput. `etaSeconds` is null
 * until the smoothed speed is stable enough to divide remaining bytes by.
 */
export interface TransferStats {
  /** True while at least one file is actively transferring. */
  active: boolean;
  /** Smoothed throughput in bytes/second (0 before it stabilizes / on a stall). */
  speedBps: number;
  /** Seconds remaining at the current speed, or null when not yet computable. */
  etaSeconds: number | null;
  /** Bytes still to move across the active files (for the UI's own labels). */
  remainingBytes: number;
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
  /** Live throughput + ETA across the in-flight files (client-side only). */
  stats: TransferStats;
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
  /** Pause an in-flight item — sink stays healthy; resume continues from the durable offset. */
  pause: (id: string) => void;
  /** Resume a paused item — re-offers with the same resumeToken (or asks the sender to). */
  resume: (id: string) => void;
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
  "channel-error": "The direct link between the devices hit an error. Retry to reconnect.",
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

/**
 * Does `name` already exist in `dir`?
 *
 * Deliberately cheap: ONE `getFileHandle` for the exact name, never a directory
 * scan. A `NotFoundError` is the API's way of saying the slot is free.
 *
 * Returns "unknown" when the probe fails for any OTHER reason (a revoked
 * permission, a transient FS error). That third state matters: treating an
 * unreadable directory as "free" would let us overwrite a file we simply could
 * not see, and treating it as "taken" would spin forever looking for a free slot.
 */
async function existsInDir(dir: FsDirHandle, name: string): Promise<boolean | "unknown"> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (err) {
    return (err as { name?: string } | null)?.name === "NotFoundError" ? false : "unknown";
  }
}

/**
 * De-dupe a filename for a folder target: "a.txt", "a (1).txt", …
 *
 * Two different things can collide and both are checked:
 *   - names already claimed by EARLIER FILES IN THE SAME BATCH (`used`), and
 *   - files ALREADY ON DISK in the chosen folder (`dir`).
 *
 * Without the second check, receiving `report.pdf` into a folder that already
 * holds one silently clobbered the existing file (issue #133). The existing file
 * now always wins its name and the incoming one steps aside.
 *
 * When a disk probe is inconclusive we take the current candidate and stop
 * probing, so the real `create: true` write surfaces the real error rather than
 * this helper inventing a different filename or looping.
 *
 * `dir` is optional so callers with no folder target keep the pure in-batch
 * behaviour.
 */
async function uniqueName(used: Set<string>, name: string, dir?: FsDirHandle): Promise<string> {
  const dot = name.lastIndexOf(".");
  // dot > 0 keeps dotfiles whole: ".env" stems to ".env", not "" + ".env".
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";

  let candidate = name;
  for (let n = 1; ; n += 1) {
    if (!used.has(candidate)) {
      const onDisk = dir ? await existsInDir(dir, candidate) : false;
      if (onDisk !== true) {
        used.add(candidate);
        return candidate;
      }
    }
    candidate = `${stem} (${n})${ext}`;
  }
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
  /** Keys the user paused — skipped by auto-resume until an explicit resume() clears them. */
  const pausedKeysRef = useRef<Set<string>>(new Set());
  /** Receive item id -> file key, so cancel(id) can find & poison the right entry. */
  const rxIdKeyRef = useRef<Map<string, string>>(new Map());
  /** Ref mirrors so long-lived peer event listeners never read stale state. */
  const itemsRef = useRef<TransferItem[]>([]);
  const peersListRef = useRef<string[]>([]);
  /** Current room code, for stamping ledger rows from long-lived listeners. */
  const codeRef = useRef<string | null>(joinCode ?? null);
  /** Rolling-window throughput sampler fed by the aggregate progress ticks. */
  const speedRef = useRef(new SpeedTracker());
  const [stats, setStats] = useState<TransferStats>({
    active: false,
    speedBps: 0,
    etaSeconds: null,
    remainingBytes: 0,
  });
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    peersListRef.current = peers;
  }, [peers]);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

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
  /** Late-bound resume so bindPeer's resume-requested listener stays stable. */
  const resumeRef = useRef<(id: string) => void>(() => {});
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
        if (key) {
          reg.delete(key); // completion or cancel -> drop the durable entry
          void removeRxLedger(key); // ...and its reload-resume ledger row (#36)
        }
      },
    };
  }, []);

  /**
   * Decide what to do with an inbound offer (Fable H3/H5/M1/M2): if EVERY item is a
   * known in-progress file — its key is in the registry, not active, token matches,
   * not cancelled, AND its sink is healthy — auto-accept it with each file's durable
   * resume offset and NO modal. Otherwise surface the accept modal. Duplicate keys
   * in one batch disable resume (force the modal). A POISONED sink (a failed write)
   * also forces the modal: silently auto-resuming onto a sink that can no longer
   * accept bytes would just stream the whole tail into nowhere and die at file-end.
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
            !e.sink.failed &&
            !!it.resumeToken &&
            e.resumeToken === it.resumeToken &&
            !cancelledKeysRef.current.has(it.key!) &&
            !pausedKeysRef.current.has(it.key!)
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
        peer.acceptOffer(info.batchId, target, resume, supportedCodecs());
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
      peer.on("transfer", (item) => {
        upsertItem({ ...item, peerId });
        // A pause (local or remote) must park the durable entry inactive and
        // remember the key so an unrelated reconnect does not auto-resume.
        // Unlike cancel, the sink stays healthy.
        if (guardTargetFor(item.status, item.direction) === "paused") {
          const key = rxIdKeyRef.current.get(item.id);
          if (key) {
            pausedKeysRef.current.add(key);
            const e = receiveRegRef.current.get(key);
            if (e) e.active = false;
          }
        }
        // Reload-resume (#36): persist a resumable receive's DURABLE offset to the
        // ledger. For a receive, item.transferred IS sink.bytesWritten (durable), and
        // the peer throttles these emits to ~1% deltas, so this is a cheap upsert on
        // the commit point — the ledger can never claim more than is staged (H1).
        if (item.direction === "receive" && item.kind === "file") {
          const key = rxIdKeyRef.current.get(item.id);
          const e = key ? receiveRegRef.current.get(key) : undefined;
          const room = codeRef.current;
          if (e?.ledger && key && room) {
            // Keep the ledger row's sinkKind in step with the sink that ACTUALLY
            // holds the bytes: an OPFS receive that fell back to IDB (#170) reports
            // activeKind "idb", so a reload reconstructs an idbSink over the IDB
            // rows rather than probing an OPFS file that was never written.
            const liveKind = (e.sink as { activeKind?: LedgerSinkKind }).activeKind;
            if (liveKind) e.ledger.sinkKind = liveKind;
            void putRxLedger({
              key,
              room,
              fileId: e.ledger.fileId,
              resumeToken: e.resumeToken,
              size: e.size,
              bytesWritten: item.transferred,
              sinkKind: e.ledger.sinkKind,
              mime: e.ledger.mime,
              name: e.ledger.name,
              ts: Date.now(),
            });
          }
        }
      });

      // A whole manifest arrived from THIS peer — auto-resume a known in-progress
      // file (no modal), else surface the accept modal.
      peer.on("incoming-offer", (info) => handleIncomingOffer(peerId, info));

      // file-received / text-received are already covered by the `transfer`
      // emit (which stamps peerId), so nothing extra to do here.
      peer.on("file-received", () => {});
      peer.on("text-received", () => {});
      peer.on("declined", () => {});
      peer.on("cancelled", () => {});

      peer.on("resume-requested", ({ id }) => {
        resumeRef.current(id);
      });

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
      speedRef.current.reset(); // a fresh session starts its speed window clean

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
          "rate-limited": "Too many attempts — wait a minute.",
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
          t.status !== "cancelled" &&
          t.status !== "paused", // user-held; wait for explicit resume()
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
    const large = isLargeBatch(total, biggest);
    const fs = window as unknown as WindowWithFsPickers;
    // Single source of truth for the disk-vs-memory decision (#54): a multi-file
    // batch needs the directory picker, a single file the save-file picker; a
    // browser without the matching picker falls through to "memory".
    const strategy = chooseReceiveStrategy({
      itemCount: off.items.length,
      large,
      fs: detectFsAccessSupport(window),
    });

    let target: AcceptTarget | undefined;
    if (strategy !== "memory") {
      // Prompt FROM the accept user-gesture (we haven't awaited anything yet).
      // If the user dismisses the picker (AbortError) we fall back to in-memory.
      try {
        if (strategy === "disk-dir") {
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

    // Large but NO disk target (no FS Access API, or the picker was cancelled):
    // stage to origin storage. PREFER OPFS — it streams chunks straight to a bucket
    // file in place with no in-RAM Blob-of-Blobs assembly (research-2026-07 P1), so
    // it sidesteps the iOS jetsam ceiling the IndexedDB path works around. Fall back
    // to IndexedDB Blob staging only where OPFS sync access is unavailable. Gate on
    // storage quota either way and refuse honestly if it won't fit (Fable M3/M4).
    // OPFS has no assembly step, so it skips estimateFits' iOS MEMORY cap and gates
    // on quota alone — letting iOS receive larger files than the IDB path could.
    let useOpfs = false;
    let useIdb = false;
    if (large && !target) {
      const opfs = opfsSupported();
      const fit = opfs ? await storageFits(total) : await estimateFits(total);
      if (!fit.ok) {
        setIncoming(null);
        peer.declineOffer(off.batchId);
        fail("too-large", fit.reason);
        return;
      }
      if (opfs) useOpfs = true;
      else useIdb = true;
    }

    // Build a durable registry entry + sink per file BEFORE accepting, so the
    // received bytes live in a place the HOOK owns and thus survive a peer rebuild
    // on reconnect (the key to resume). Disk => stream to the chosen target (names
    // de-duped within a folder); otherwise accumulate in memory.
    const usedNames = new Set<string>();
    for (const it of off.items) {
      if (!it.key) continue;
      // A prior partial for this key (a poisoned sink, or a re-offer the user
      // chose to accept fresh) is being REPLACED — abort it so its OPFS staging
      // file / IDB rows are freed now instead of lingering until the TTL GC.
      const prev = receiveRegRef.current.get(it.key);
      if (prev) void prev.sink.abort();
      let sink: ReceiveSink;
      let savedName: string | undefined;
      if (target && "dirHandle" in target) {
        const dir = target.dirHandle;
        // Probes the folder as well as this batch, so an existing file keeps its
        // name and the incoming one becomes "name (1).ext" (issue #133).
        savedName = await uniqueName(usedNames, it.name, dir);
        const name = savedName;
        sink = diskSink(async () => (await dir.getFileHandle(name, { create: true })).createWritable());
      } else if (target && "fileHandle" in target) {
        savedName = target.fileHandle.name || it.name;
        const fh = target.fileHandle;
        sink = diskSink(async () => fh.createWritable());
      } else if (useOpfs) {
        // large, no FS Access -> OPFS (streams in place), with a runtime fallback
        // to IDB staging if the OPFS sync access handle is unavailable and the sink
        // poisons before acking a single byte (issue #170). The fallback keeps the
        // receive alive on the exact browsers the IDB last-resort targets.
        sink = opfsSinkWithIdbFallback(it.id, it.mime);
      } else if (useIdb) {
        sink = idbSink(it.id, it.mime); // large, no OPFS -> IDB staging (last resort)
      } else {
        sink = memorySink(it.mime);
      }
      // Reload-resume coordinates (#36): only the origin-storage sinks stage bytes
      // that survive a reload, so only they get a ledger row. `fileId` is the staging
      // name (the offer item id) so a reload reconstructs the SAME sink over the SAME
      // IDB rows / OPFS file. Both IDB and OPFS rows are rehydrated on mount (#169);
      // OPFS reconciles its offset against the file's real durable length first.
      const ledger =
        useIdb || useOpfs
          ? { fileId: it.id, sinkKind: (useIdb ? "idb" : "opfs") as LedgerSinkKind, mime: it.mime, name: it.name }
          : undefined;
      receiveRegRef.current.set(it.key, {
        key: it.key,
        size: it.size,
        resumeToken: it.resumeToken ?? "",
        sink,
        target,
        active: false,
        savedName,
        ledger,
      });
      rxIdKeyRef.current.set(it.id, it.key);
      // Seed the ledger row at offset 0 so an early reload (before the first progress
      // tick) still finds a resumable entry; progress upserts refine bytesWritten.
      if (ledger) {
        const room = codeRef.current;
        if (room) {
          void putRxLedger({
            key: it.key,
            room,
            fileId: ledger.fileId,
            resumeToken: it.resumeToken ?? "",
            size: it.size,
            bytesWritten: 0,
            sinkKind: ledger.sinkKind,
            mime: ledger.mime,
            name: ledger.name,
            ts: Date.now(),
          });
        }
      }
    }

    // Clear the modal only after the picker settles, so a cancelled picker can
    // still fall through to an in-memory accept of the same offer.
    setIncoming(null);
    // Advertise the codecs we can decode (#130) so the sender may compress
    // compressible files; a stack without CompressionStream advertises nothing
    // and receives raw bytes (backward compatible).
    peer.acceptOffer(off.batchId, target, undefined, supportedCodecs());
  }, [incoming]);

  const decline = useCallback(() => {
    const off = incoming;
    if (!off) return;
    setIncoming(null);
    // A decline can land on an offer that fell back to the modal despite a stale
    // partial (e.g. a poisoned sink). Drop those durable entries + ledger rows now
    // so they neither linger until the TTL GC nor auto-resume on a later re-offer.
    for (const it of off.items) {
      if (!it.key) continue;
      const e = receiveRegRef.current.get(it.key);
      if (e) {
        void e.sink.abort();
        receiveRegRef.current.delete(it.key);
        void removeRxLedger(it.key);
      }
    }
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
        pausedKeysRef.current.delete(key); // cancel wins over pause
        const e = receiveRegRef.current.get(key);
        if (e) void e.sink.abort();
        receiveRegRef.current.delete(key);
        void removeRxLedger(key); // a cancelled file must not reload-resume (#36)
      }

      // Route to the peer that owns the item; the item carries its peerId.
      // Reads itemsRef (kept in sync with `items`) instead of closing over
      // `items` directly, so this callback's identity stays stable across
      // progress ticks — otherwise every ItemRow using it as a prop would
      // re-render on every tick regardless of React.memo.
      const item = itemsRef.current.find((t) => t.id === id);
      const peer = item?.peerId ? peersRef.current.get(item.peerId) : undefined;
      if (peer) {
        peer.cancel(id);
        return;
      }
      // Fallback (e.g. peerId not yet stamped): try every peer; the wrong ones
      // no-op because they don't own the id.
      for (const p of peersRef.current.values()) p.cancel(id);
    },
    [],
  );

  const pause = useCallback((id: string) => {
    // Do NOT poison the sink (that is cancel's job). The transfer handler adds
    // the key to pausedKeysRef when status flips to paused.
    const item = itemsRef.current.find((t) => t.id === id);
    const peer = item?.peerId ? peersRef.current.get(item.peerId) : undefined;
    if (peer) {
      peer.pause(id);
      return;
    }
    for (const p of peersRef.current.values()) p.pause(id);
  }, []);

  /** Re-offer a paused send item. `notifyPeer` asks the receiver to clear its
   *  pausedKeys before the offer arrives; skip it when WE are answering their
   *  resume-requested (otherwise the two sides ping-pong). */
  const reofferPausedSend = useCallback((id: string, notifyPeer: boolean) => {
    const item = itemsRef.current.find((t) => t.id === id);
    if (!item || item.direction !== "send" || item.status !== "paused") return;
    const peer = item.peerId ? peersRef.current.get(item.peerId) : undefined;
    const pool = allFilesRef.current;
    const i = pool.findIndex((f) => f.name === item.name && f.size === item.size);
    if (i === -1 || !peer) return;
    const file = pool[i];
    if (!file) return;
    setItems((prev) => prev.filter((t) => t.id !== id));
    if (notifyPeer) peer.requestResume(id);
    void peer.offerFiles([file]).catch(() => {
      pendingFilesRef.current = [file];
    });
  }, []);

  const resume = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((t) => t.id === id);
      if (!item || item.status !== "paused") return;

      // Clear the auto-resume guard so a re-offer continues from the durable offset.
      const key = rxIdKeyRef.current.get(id);
      if (key) pausedKeysRef.current.delete(key);

      if (item.direction === "send") {
        reofferPausedSend(id, true);
        return;
      }

      // Receive side: ask the sender to re-offer.
      const peer = item.peerId ? peersRef.current.get(item.peerId) : undefined;
      if (peer) peer.requestResume(id);
      else for (const p of peersRef.current.values()) p.requestResume(id);
    },
    [reofferPausedSend],
  );

  // resume-requested from the other side: clear our guard, and re-offer if we
  // hold the File. Do NOT echo requestResume — that would loop.
  resumeRef.current = (id: string) => {
    const key = rxIdKeyRef.current.get(id);
    if (key) pausedKeysRef.current.delete(key);
    reofferPausedSend(id, false);
  };

  const downloadOne = useCallback(
    (id: string) => {
      // Same reasoning as cancel(): read itemsRef, not items, to keep this
      // callback's reference stable across progress ticks.
      const item = itemsRef.current.find((t) => t.id === id);
      // savedToDisk items are already on disk (no blob) -> nothing to download.
      if (!item || item.savedToDisk || !item.blob) return;
      saveBlob(item.blob, item.name);
    },
    [],
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

    // Stream the archive slice-by-slice (issue #28) instead of zipSync, which
    // blocked the main thread for the whole build and held a second full copy of
    // every blob in memory (a 1.5 GB batch peaked at ~3 GB and OOM-killed tabs).
    void streamZipDownload(
      received.map((t) => ({ name: t.name, blob: t.blob! })),
      "warp-files.zip",
    ).catch(() => fail("channel-error"));
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

  // Warn before the tab closes while bytes are in flight — an accidental ⌘W
  // or reload kills every in-flight transfer for all peers. Native
  // beforeunload prompt only while something is transferring/reconnecting/
  // paused; removed the moment nothing is (an always-on listener disables
  // bfcache and is hostile). Mirrors the wake-lock effect's shape.
  const inFlight = items.some(
    (t) => t.status === "transferring" || t.status === "reconnecting" || t.status === "paused",
  );
  useEffect(() => {
    if (!inFlight) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [inFlight]);

  // Prune abandoned staging (IDB rows + OPFS files) and stale reload-resume ledger
  // rows from crashed sessions once on mount (best-effort).
  useEffect(() => {
    void gcOrphanStaging();
    void gcOrphanOpfs();
    void gcRxLedger();
  }, []);

  // Live speed + ETA: on every progress tick, feed the aggregate bytes-in-flight
  // into the rolling-window sampler and republish a client-side throughput
  // readout. Aggregating across items means a mesh room moving several files at
  // once reports their COMBINED speed; the sampler's window smooths chunk bursts
  // and self-heals after a stall. Runs only while something is transferring, so
  // an idle session publishes a single inactive readout and then stops.
  useEffect(() => {
    const active = items.filter(
      (t) => t.kind === "file" && (t.status === "transferring" || t.status === "reconnecting"),
    );
    if (!active.length) {
      speedRef.current.reset();
      setStats((s) =>
        s.active ? { active: false, speedBps: 0, etaSeconds: null, remainingBytes: 0 } : s,
      );
      return;
    }
    const transferred = active.reduce((sum, t) => sum + t.transferred, 0);
    const remaining = active.reduce((sum, t) => sum + Math.max(0, t.size - t.transferred), 0);
    const tracker = speedRef.current;
    tracker.add(transferred);
    const speedBps = tracker.speed();
    const etaSeconds = tracker.etaSeconds(remaining);
    setStats({ active: true, speedBps, etaSeconds, remainingBytes: remaining });
  }, [items]);

  /**
   * Reload-resume (#36): repopulate the receive registry from the durable ledger so
   * an accidental tab reload doesn't restart a large receive from zero. The sender
   * never gives up — it re-offers unfinished files with the same `resumeToken` — and
   * `handleIncomingOffer` already auto-resumes any inactive registry entry whose
   * key + token match. So reload-survival is just "rebuild the entries from durable
   * storage on mount"; the existing auto-resume path does the rest.
   *
   * Both durable kinds reconcile the ledger offset against what is REALLY staged now
   * and resume at `min(real, ledger)` — never the ledger alone (H1). The ledger's
   * `bytesWritten` was durable when written, but it can outlive the staged bytes:
   * OPFS flushes are BATCHED, so after an unclean close the file's real length can lag
   * the ledger (#169, measured via `opfsDurableLength`); and the IDB staging rows and
   * the ledger row live in separate databases with independent TTL GCs, so a prefix
   * row can be reaped while a fresher ledger row survives (measured via
   * `idbDurableLength`, the contiguous-prefix length). If the durable length can't be
   * read (OPFS file gone / unavailable) we drop the row; if it measures 0 we resume at
   * 0 (an honest full re-receive through the auto-resume path). Memory / disk receives
   * have no row and restart honestly (the sender's re-offer shows the accept modal).
   */
  const hydrateFromLedger = useCallback(async (room: string) => {
    const rows = await readRxLedger(room);
    const reg = receiveRegRef.current;
    for (const row of rows) {
      if (row.sinkKind !== "idb" && row.sinkKind !== "opfs") continue; // others: honest restart
      // Trust the offset only if it's a sane, incomplete count — a corrupt or
      // already-complete row is dropped, never resumed (H1/H2).
      if (!Number.isInteger(row.bytesWritten) || row.bytesWritten < 0 || row.bytesWritten >= row.size) {
        void removeRxLedger(row.key);
        continue;
      }
      if (reg.has(row.key)) continue; // a live entry already owns this file
      if (row.sinkKind === "idb") {
        // Reconcile the ledger offset against the rows that are ACTUALLY durable now,
        // mirroring the OPFS branch below. The ledger's bytesWritten was durable when
        // written, but the staging rows and the ledger row live in separate databases
        // with independent TTL GCs (gcOrphanStaging vs gcRxLedger), so a prefix row can
        // be reaped while a fresher ledger row survives. Trusting the ledger alone
        // would then report an offset whose prefix is gone and finalize a truncated
        // file (H1). Resume at min(durable prefix, ledger) — never the ledger alone.
        const real = await idbDurableLength(row.fileId);
        const offset = Math.min(real, row.bytesWritten);
        if (!Number.isInteger(offset) || offset < 0 || offset >= row.size) {
          void removeRxLedger(row.key);
          continue;
        }
        reg.set(row.key, {
          key: row.key,
          size: row.size,
          resumeToken: row.resumeToken,
          sink: idbSink(row.fileId, row.mime, offset),
          active: false,
          ledger: { fileId: row.fileId, sinkKind: "idb", mime: row.mime, name: row.name },
        });
        continue;
      }
      // OPFS: reconcile the ledger offset against the file's real durable length.
      // A length we can't read means we can't prove where the durable prefix ends, so
      // drop the row and let the sender's re-offer show the accept modal (honest
      // restart) rather than resume onto a hole.
      const real = await opfsDurableLength(row.fileId);
      if (real === undefined) {
        void removeRxLedger(row.key);
        continue;
      }
      const offset = Math.min(real, row.bytesWritten);
      if (!Number.isInteger(offset) || offset < 0 || offset >= row.size) {
        void removeRxLedger(row.key);
        continue;
      }
      reg.set(row.key, {
        key: row.key,
        size: row.size,
        resumeToken: row.resumeToken,
        sink: opfsSink(row.fileId, row.mime, offset),
        active: false,
        ledger: { fileId: row.fileId, sinkKind: "opfs", mime: row.mime, name: row.name },
      });
    }
  }, []);

  // Receiver: auto-join the room from the URL on mount — hydrating the durable
  // ledger FIRST so the sender's re-offer resumes from the staged offset (#36). The
  // IDB read is fast and settles well before the signaling join + re-offer RTT.
  useEffect(() => {
    if (!joinCode) return;
    let cancelled = false;
    void hydrateFromLedger(joinCode).finally(() => {
      if (!cancelled) connect(joinCode);
    });
    return () => {
      cancelled = true;
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
    stats,
    createRoom,
    sendFiles,
    sendText,
    accept,
    decline,
    cancel,
    pause,
    resume,
    downloadOne,
    downloadAll,
    retry,
  };
}

// ponytail: `formatBytes` is re-exported for the UI's convenience so it doesn't
// re-derive the size formatter; if unused by the UI this line can be dropped.
export { formatBytes };
