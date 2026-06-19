/**
 * Session-state layer for LAN-discovery transfers.
 *
 * Discovery + the WebRTC transport are owned by `useNearby` (src/lib/wrap/useNearby):
 * it keeps one persistent announced socket, exposes the live `nearby` snapshot, and
 * hands back primed `WrapPeer`s — `connectTo(peerId)` for outbound sends (an already-
 * started initiator) and `onIncoming(cb)` for inbound offers (a responder already fed
 * the offer). See useNearby.ts.
 *
 * This hook adds the bit `useNearby` deliberately leaves to the UI: a single live
 * "session" with per-file progress, derived from the `WrapPeer` events. It binds
 * handlers onto the peer `useNearby` returns, accumulates `TransferItem`s, and surfaces
 * an `incoming` accept prompt that defers binding the responder until the user accepts.
 *
 * Roles / glare are handled inside `useNearby`/`peer.ts`: the side that calls
 * `connectTo` (and picks files) is the initiator; the receiving side gets a responder
 * via `onIncoming`. Exactly one offer per pair, so no glare.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNearby, type IncomingConnection, type NearbyDevice } from "../lib/wrap/useNearby";
import type { WrapPeer } from "../lib/wrap/peer";
import { type TransferItem } from "../lib/wrap/transfer";

export type { NearbyDevice } from "../lib/wrap/useNearby";

/** One side of a live discovery transfer (outgoing send or incoming receive). */
export type SessionStatus =
  | "connecting" // handshake in flight
  | "transferring" // bytes moving
  | "done" // all files flushed
  | "error";

export interface NearbySession {
  peerId: string;
  peerName: string;
  direction: "send" | "receive";
  status: SessionStatus;
  transfers: TransferItem[];
  errorMessage: string | null;
}

/** A pending incoming offer the user must accept before we start receiving. */
export interface IncomingRequest {
  peerId: string;
  peerName: string;
}

export interface UseNearbyTransfer {
  selfId: string | null;
  deviceName: string;
  devices: NearbyDevice[];
  crowded: boolean;
  session: NearbySession | null;
  incoming: IncomingRequest | null;
  /** Begin sending `files` to a discovered device. */
  sendTo: (peerId: string, files: File[]) => void;
  /** Accept the pending incoming offer (begins receiving + downloading). */
  acceptIncoming: () => void;
  /** Decline the pending incoming offer (tears the primed responder down). */
  declineIncoming: () => void;
  /** Clear the finished/failed session panel. */
  dismissSession: () => void;
}

const PEER_ERROR_COPY: Record<string, string> = {
  "nat-failed": "Couldn't open a direct channel. One device may be on a restrictive network.",
  disconnected: "The other device disconnected before the transfer finished.",
  "channel-error": "The data channel hit an error.",
};

export function useNearbyTransfer(): UseNearbyTransfer {
  const nearby = useNearby();
  const { selfId, devices, crowded, deviceName, connectTo, onIncoming } = nearby;

  const [session, setSession] = useState<NearbySession | null>(null);
  const [incoming, setIncoming] = useState<IncomingRequest | null>(null);

  /** The peer backing the active session (so dismiss can close it). */
  const peerRef = useRef<WrapPeer | null>(null);
  /** The primed responder awaiting the user's accept. */
  const pendingIncomingRef = useRef<IncomingConnection | null>(null);

  // ---- session-state plumbing ---------------------------------------------

  const upsertTransfer = useCallback((item: TransferItem) => {
    setSession((prev) => {
      if (!prev) return prev;
      const idx = prev.transfers.findIndex((t) => t.id === item.id);
      const transfers = idx === -1 ? [...prev.transfers, item] : prev.transfers.slice();
      if (idx !== -1) transfers[idx] = item;
      return {
        ...prev,
        transfers,
        status: prev.status === "done" || prev.status === "error" ? prev.status : "transferring",
      };
    });
  }, []);

  const failSession = useCallback((message: string) => {
    setSession((prev) => (prev ? { ...prev, status: "error", errorMessage: message } : prev));
  }, []);

  /** Bind a peer's lifecycle events into the active session. */
  const bindPeer = useCallback(
    (peer: WrapPeer, direction: "send" | "receive") => {
      peer.on("transfer", (item) => upsertTransfer(item));
      // For a SEND, "send-complete" fires when every file is flushed; for a
      // RECEIVE it fires on the inbound `all-done` marker. Either way: done.
      peer.on("send-complete", () =>
        setSession((prev) => (prev && prev.status !== "error" ? { ...prev, status: "done" } : prev)),
      );
      peer.on("error", (kind) => failSession(PEER_ERROR_COPY[kind] ?? "The transfer failed."));
      if (direction === "send") {
        // On channel open the caller pushes the staged files (see sendTo).
        peer.on("connected", () =>
          setSession((prev) =>
            prev && prev.status === "connecting" ? { ...prev, status: "transferring" } : prev,
          ),
        );
      }
    },
    [failSession, upsertTransfer],
  );

  // ---- inbound offers ------------------------------------------------------

  useEffect(() => {
    const off = onIncoming((conn: IncomingConnection) => {
      // Only surface one prompt at a time; ignore extra offers while busy.
      if (pendingIncomingRef.current || peerRef.current) {
        conn.peer.close();
        return;
      }
      pendingIncomingRef.current = conn;
      setIncoming({ peerId: conn.from, peerName: conn.name });
    });
    return off;
  }, [onIncoming]);

  const acceptIncoming = useCallback(() => {
    const conn = pendingIncomingRef.current;
    pendingIncomingRef.current = null;
    setIncoming(null);
    if (!conn) return;

    peerRef.current?.close();
    peerRef.current = conn.peer;
    setSession({
      peerId: conn.from,
      peerName: conn.name,
      direction: "receive",
      status: "connecting",
      transfers: [],
      errorMessage: null,
    });
    // The responder was already fed the offer by useNearby; just bind handlers.
    // Its receive path (WrapPeer.onControl) prompts for a save location per file
    // via File System Access, with an in-memory Blob download fallback.
    bindPeer(conn.peer, "receive");
  }, [bindPeer]);

  const declineIncoming = useCallback(() => {
    const conn = pendingIncomingRef.current;
    pendingIncomingRef.current = null;
    setIncoming(null);
    conn?.peer.close();
  }, []);

  // ---- outbound sends ------------------------------------------------------

  const sendTo = useCallback(
    (peerId: string, files: File[]) => {
      if (!files.length) return;
      peerRef.current?.close();

      const peer = connectTo(peerId);
      if (!peer) {
        // Socket not ready — show an error session the user can dismiss.
        setSession({
          peerId,
          peerName: devices.find((d) => d.peerId === peerId)?.name ?? "Device",
          direction: "send",
          status: "error",
          transfers: [],
          errorMessage: "Network isn't ready yet — give it a second and try again.",
        });
        return;
      }
      peerRef.current = peer;
      setSession({
        peerId,
        peerName: devices.find((d) => d.peerId === peerId)?.name ?? "Device",
        direction: "send",
        status: "connecting",
        transfers: [],
        errorMessage: null,
      });
      bindPeer(peer, "send");

      // Push files the moment the channel is open (sendFiles waits for "open").
      if (peer.isConnected) {
        setSession((prev) => (prev ? { ...prev, status: "transferring" } : prev));
        peer.sendFiles(files).catch(() => failSession("The data channel hit an error."));
      } else {
        const off = peer.on("connected", () => {
          off();
          peer.sendFiles(files).catch(() => failSession("The data channel hit an error."));
        });
      }
    },
    [bindPeer, connectTo, devices, failSession],
  );

  const dismissSession = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    setSession(null);
  }, []);

  return {
    selfId,
    deviceName,
    devices,
    crowded,
    session,
    incoming,
    sendTo,
    acceptIncoming,
    declineIncoming,
    dismissSession,
  };
}
