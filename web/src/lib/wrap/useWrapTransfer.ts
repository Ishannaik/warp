/**
 * React hook orchestrating a Wrap transfer: signaling socket, the WebRTC peer,
 * and the file-transfer state machine. Both sender and receiver use this hook —
 * pass `joinCode` to act as the receiver who joins an existing room.
 *
 * Roles & glare avoidance (see peer.ts): whoever JOINS a room and receives a
 * non-empty `peers` list is the initiator and offers to the first existing
 * peer. The room creator waits for `peer-joined` then for the incoming offer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SignalingClient, type SignalData } from "./signaling";
import { WrapPeer, type PeerErrorKind } from "./peer";
import { type TransferItem } from "./transfer";

export type WrapMode = "send" | "receive";

export type WrapStatus =
  | "idle" // nothing started yet
  | "connecting" // socket opening / joining room
  | "waiting" // in a room, waiting for the other side
  | "connected" // data channel open
  | "transferring" // bytes in flight
  | "done" // all transfers finished
  | "error";

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
  transfers: TransferItem[];
  error: WrapError | null;
  /** Sender: open a fresh room and wait for a peer. */
  createRoom: () => void;
  /** Sender: stream the given files once a peer is connected. */
  startSend: (files: File[]) => Promise<void>;
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

export function useWrapTransfer(joinCode?: string): UseWrapTransfer {
  const mode: WrapMode = joinCode ? "receive" : "send";

  const [code, setCode] = useState<string | null>(joinCode ?? null);
  const [peers, setPeers] = useState<string[]>([]);
  const [status, setStatus] = useState<WrapStatus>("idle");
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [error, setError] = useState<WrapError | null>(null);

  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<WrapPeer | null>(null);
  /** Files staged by the sender to push the moment the channel opens. */
  const pendingFilesRef = useRef<File[] | null>(null);
  /** True once we've fired startSend, so we don't double-send. */
  const sentRef = useRef(false);

  const shareUrl = useMemo(
    () => (code ? `${window.location.origin}/r/${code}` : null),
    [code],
  );

  const fail = useCallback((kind: WrapError["kind"], message?: string) => {
    setError({ kind, message: message ?? ERROR_MESSAGES[kind] });
    setStatus("error");
  }, []);

  /** Merge a transfer item update into state by id. */
  const upsertTransfer = useCallback((item: TransferItem) => {
    setTransfers((prev) => {
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
        setStatus((s) => (s === "transferring" || s === "done" ? s : "connected"));
        // Sender auto-starts queued files when the channel comes up.
        const files = pendingFilesRef.current;
        if (files && files.length && !sentRef.current) {
          sentRef.current = true;
          setStatus("transferring");
          peer.sendFiles(files).catch(() => fail("channel-error"));
        }
      });
      peer.on("transfer", (item) => {
        upsertTransfer(item);
        setStatus((s) => (s === "done" ? s : "transferring"));
      });
      peer.on("send-complete", () => setStatus("done"));
      peer.on("error", (kind) => fail(kind));
    },
    [fail, upsertTransfer],
  );

  /** Establish the signaling socket and the join/role dance. */
  const connect = useCallback(
    (roomCode: string | undefined) => {
      // Tear down any prior session.
      peerRef.current?.close();
      peerRef.current = null;
      signalingRef.current?.close();
      sentRef.current = false;
      setTransfers([]);
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

  const startSend = useCallback(
    async (files: File[]) => {
      if (!files.length) {
        fail("no-files");
        return;
      }
      pendingFilesRef.current = files;
      // If the channel is already open, push immediately; else `connected` will.
      const peer = peerRef.current;
      if (peer && peer.isConnected && !sentRef.current) {
        sentRef.current = true;
        setStatus("transferring");
        try {
          await peer.sendFiles(files);
        } catch {
          fail("channel-error");
        }
      }
    },
    [fail],
  );

  const retry = useCallback(() => {
    sentRef.current = false;
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
    transfers,
    error,
    createRoom,
    startSend,
    retry,
  };
}
