/**
 * React hook orchestrating a Wrap transfer: signaling socket, the WebRTC peer,
 * and the symmetric file-transfer tray. Both sender and receiver use this hook —
 * pass `joinCode` to act as the receiver who joins an existing room.
 *
 * Roles & glare avoidance (see peer.ts): whoever JOINS a room and receives a
 * non-empty `peers` list is the initiator and offers to the first existing
 * peer. The room creator waits for `peer-joined` then for the incoming offer.
 *
 * Review-before-receive redesign: the channel STAYS OPEN after a batch. Status
 * reaches "connected" and stays there — there is no terminal "done". Either peer
 * can offer files or send text repeatedly. Received files land in `items[]` as
 * in-memory blobs; the UI downloads them on demand (one file, or a zip of all).
 * An incoming `offer` is surfaced via `incoming` until the user accepts/declines.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zipSync, type Zippable } from "fflate";
import { SignalingClient, type SignalData } from "./signaling";
import { WrapPeer, type PeerErrorKind } from "./peer";
import { formatBytes, type OfferItem, type TransferItem } from "./transfer";

export type WrapMode = "send" | "receive";

export type WrapStatus =
  | "idle" // nothing started yet
  | "connecting" // socket opening / joining room
  | "waiting" // in a room, waiting for the other side
  | "connected" // data channel open — STAYS here; both peers can keep sending
  | "error";

/** A pending inbound batch manifest awaiting the user's accept/decline. */
export interface IncomingOffer {
  batchId: string;
  items: OfferItem[];
}

export interface WrapError {
  kind: PeerErrorKind | "signaling" | "no-files";
  message: string;
}

export interface UseWrapTransfer {
  mode: WrapMode;
  code: string | null;
  shareUrl: string | null;
  peers: string[];
  status: WrapStatus;
  /** The session tray: every item we've sent or received, both directions. */
  items: TransferItem[];
  /** A pending offer from the peer awaiting accept/decline, or null. */
  incoming: IncomingOffer | null;
  error: WrapError | null;
  /** Sender: open a fresh room and wait for a peer. */
  createRoom: () => void;
  /** Offer files to the peer (gated by their accept). Safe to call repeatedly. */
  sendFiles: (files: File[]) => Promise<void>;
  /** Send a text snippet — appears directly in the peer's tray (no accept). */
  sendText: (text: string) => void;
  /** Accept the pending incoming offer -> bytes flow into the tray. */
  accept: () => void;
  /** Decline the pending incoming offer -> nothing is received. */
  decline: () => void;
  /** Cancel an in-flight item (either direction) by id. */
  cancel: (id: string) => void;
  /** Save one received file's blob to disk via an anchor download. */
  downloadOne: (id: string) => void;
  /** Zip all received, done file-items into wrap-files.zip and download it. */
  downloadAll: () => void;
  /** Re-attempt after a failure (tears down and restarts the same role). */
  retry: () => void;
}

const ERROR_MESSAGES: Record<WrapError["kind"], string> = {
  "nat-failed": "Couldn't punch through the network. One side may be on a restrictive NAT.",
  disconnected: "The peer disconnected before the transfer finished.",
  "channel-error": "The data channel hit an error.",
  signaling: "Lost contact with the signaling server.",
  "no-files": "Add at least one file before opening a channel.",
};

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

export function useWrapTransfer(joinCode?: string): UseWrapTransfer {
  const mode: WrapMode = joinCode ? "receive" : "send";

  const [code, setCode] = useState<string | null>(joinCode ?? null);
  const [peers, setPeers] = useState<string[]>([]);
  const [status, setStatus] = useState<WrapStatus>("idle");
  const [items, setItems] = useState<TransferItem[]>([]);
  const [incoming, setIncoming] = useState<IncomingOffer | null>(null);
  const [error, setError] = useState<WrapError | null>(null);

  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<WrapPeer | null>(null);
  /** Files staged by the sender to offer the moment the channel opens. */
  const pendingFilesRef = useRef<File[] | null>(null);

  const shareUrl = useMemo(
    () => (code ? `${window.location.origin}/r/${code}` : null),
    [code],
  );

  const fail = useCallback((kind: WrapError["kind"], message?: string) => {
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

  /** Wire a freshly-created peer's events into hook state. */
  const bindPeer = useCallback(
    (peer: WrapPeer) => {
      peer.on("connected", () => {
        setStatus((s) => (s === "error" ? s : "connected"));
        // Sender auto-offers any staged files when the channel comes up.
        const files = pendingFilesRef.current;
        if (files && files.length) {
          pendingFilesRef.current = null;
          peer.offerFiles(files).catch(() => fail("channel-error"));
        }
      });

      // Both directions: an item was created or its progress changed.
      peer.on("transfer", (item) => upsertItem(item));

      // A whole manifest arrived — surface the accept modal.
      peer.on("incoming-offer", (info) => setIncoming(info));

      // A file fully arrived: the engine already attached item.blob and emitted
      // a `transfer` with status "done", so we don't need to mutate state here.
      // (Hook keeps the blob in items[] for downloadOne/downloadAll.)
      peer.on("file-received", () => {});

      // A text snippet arrived: the engine emits a `transfer` with the text, so
      // upsert via that already covers it; nothing extra to do.
      peer.on("text-received", () => {});

      // A batch WE offered was declined — items are marked "declined" via
      // `transfer`, so just clear any stale staged files.
      peer.on("declined", () => {});

      // A file was cancelled (either side) — `transfer` already updated status.
      peer.on("cancelled", () => {});

      peer.on("error", (kind) => fail(kind));
    },
    [fail, upsertItem],
  );

  /** Establish the signaling socket and the join/role dance. */
  const connect = useCallback(
    (roomCode: string | undefined) => {
      // Tear down any prior session.
      peerRef.current?.close();
      peerRef.current = null;
      signalingRef.current?.close();
      setItems([]);
      setIncoming(null);
      setError(null);
      setStatus("connecting");

      const sig = new SignalingClient();
      signalingRef.current = sig;

      sig.on("joined", ({ room, peers: existing }) => {
        setCode(room); // the server's real, joinable code — not a locally-minted one
        setPeers(existing);
        if (existing.length > 0) {
          // We're the new peer -> initiator. Offer to the first existing peer.
          const peer = new WrapPeer(sig, existing[0], true);
          peerRef.current = peer;
          bindPeer(peer);
          peer.start().catch(() => fail("channel-error"));
        } else {
          // Empty room: wait for someone to join.
          setStatus("waiting");
        }
      });

      sig.on("peer-joined", (peerId) => {
        setPeers((p) => (p.includes(peerId) ? p : [...p, peerId]));
        // We were here first -> responder. Build a peer that waits for the offer.
        if (!peerRef.current) {
          const peer = new WrapPeer(sig, peerId, false);
          peerRef.current = peer;
          bindPeer(peer);
        }
      });

      sig.on("peer-left", (peerId) => {
        setPeers((p) => p.filter((x) => x !== peerId));
      });

      sig.on("signal", ({ from, data }: { from: string; data: SignalData }) => {
        // A responder may receive its first offer before any peer-joined was
        // processed into a WrapPeer; lazily construct one here.
        if (!peerRef.current) {
          const peer = new WrapPeer(sig, from, false);
          peerRef.current = peer;
          bindPeer(peer);
        }
        peerRef.current.handleSignal(from, data).catch(() => fail("channel-error"));
      });

      sig.on("error", (err: string) => {
        const map: Record<string, string> = {
          "room-not-found": "That room is no longer open — ask the sender for a fresh link.",
          "room-full": "That room is full (up to 8 devices).",
          "bad-room": "That room code looks invalid.",
        };
        fail("signaling", map[err]);
      });

      sig.connect(roomCode);
    },
    [bindPeer, fail],
  );

  const createRoom = useCallback(() => {
    // The server owns room codes. Connect with NO room so it creates one and
    // returns the real, joinable code in `joined`. (Locally-minted "WRAP-…"
    // codes were rejected by the server's validator — that broke every transfer.)
    setCode(null);
    connect(undefined);
  }, [connect]);

  const sendFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) {
        fail("no-files");
        return;
      }
      const peer = peerRef.current;
      if (peer && peer.isConnected) {
        // Channel already open: offer immediately.
        try {
          await peer.offerFiles(files);
        } catch {
          fail("channel-error");
        }
      } else {
        // Not paired yet: stage for the sender's `connected` handler to offer.
        pendingFilesRef.current = files;
      }
    },
    [fail],
  );

  const sendText = useCallback(
    (text: string) => {
      const peer = peerRef.current;
      if (!peer || !peer.isConnected || !text) return;
      try {
        peer.sendText(text);
      } catch {
        fail("channel-error");
      }
    },
    [fail],
  );

  const accept = useCallback(() => {
    const off = incoming;
    if (!off) return;
    setIncoming(null);
    peerRef.current?.acceptOffer(off.batchId);
  }, [incoming]);

  const decline = useCallback(() => {
    const off = incoming;
    if (!off) return;
    setIncoming(null);
    peerRef.current?.declineOffer(off.batchId);
  }, [incoming]);

  const cancel = useCallback((id: string) => {
    peerRef.current?.cancel(id);
  }, []);

  const downloadOne = useCallback(
    (id: string) => {
      const item = items.find((t) => t.id === id);
      if (!item || !item.blob) return;
      saveBlob(item.blob, item.name);
    },
    [items],
  );

  const downloadAll = useCallback(() => {
    // Zip every received, done file-item that still has its blob in memory.
    const received = items.filter(
      (t) => t.direction === "receive" && t.kind === "file" && t.status === "done" && t.blob,
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
        saveBlob(new Blob([zipped], { type: "application/zip" }), "wrap-files.zip");
      })
      .catch(() => fail("channel-error"));
  }, [items, fail]);

  const retry = useCallback(() => {
    pendingFilesRef.current = null;
    if (mode === "receive" && joinCode) {
      setCode(joinCode);
      connect(joinCode);
    } else if (code) {
      connect(code);
    } else {
      createRoom();
    }
  }, [mode, joinCode, code, connect, createRoom]);

  // Receiver: auto-join the room from the URL on mount.
  useEffect(() => {
    if (joinCode) connect(joinCode);
    return () => {
      peerRef.current?.close();
      signalingRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCode]);

  return {
    mode,
    code,
    shareUrl,
    peers,
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
