/**
 * Session-state layer for LAN-discovery transfers.
 *
 * Discovery + the WebRTC transport are owned by `useNearby` (src/lib/warp/useNearby):
 * it keeps one persistent announced socket, exposes the live `nearby` snapshot, and
 * hands back primed `WarpPeer`s — `connectTo(peerId)` for outbound sends (an already-
 * started initiator) and `onIncoming(cb)` for inbound offers (a responder already fed
 * the SDP offer). See useNearby.ts.
 *
 * Review-before-receive redesign: this hook now mirrors `useWarpTransfer`'s session
 * model so the LAN flow funnels into the SAME session UI + accept modal:
 *   - ONE live session per active nearby peer; the data channel stays OPEN after a
 *     batch, so either device can keep sending / send back without re-pairing.
 *   - File sends are GATED at the manifest level: the engine emits "incoming-offer"
 *     with the file list; the UI shows the accept modal and calls accept()/decline().
 *   - Received files accumulate as in-memory blobs in `items[]`; the UI downloads on
 *     demand (one file or a zip). NOTHING auto-saves.
 *
 * A nearby SDP offer (from `onIncoming`) only establishes the channel — we bind it
 * silently as the session peer. The user isn't prompted until an actual FILE offer
 * (`incoming-offer`) arrives, exactly like the code-room flow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNearby, type IncomingConnection, type NearbyDevice } from "../lib/warp/useNearby";
import type { WarpPeer } from "../lib/warp/peer";
import { streamZipDownload } from "../lib/warp/zipDownload";
import { type OfferItem, type TransferItem } from "../lib/warp/transfer";

export type { NearbyDevice } from "../lib/warp/useNearby";

/** A live discovery session (symmetric — both peers can send & receive). */
export interface NearbySession {
  peerId: string;
  peerName: string;
  /** Whether the channel is open and ready to carry files. */
  connected: boolean;
  /** The session tray: everything sent or received, both directions. */
  items: TransferItem[];
  errorMessage: string | null;
}

/** A pending inbound file offer the user must accept before bytes flow. */
export interface IncomingRequest {
  peerId: string;
  peerName: string;
  batchId: string;
  items: OfferItem[];
}

export interface UseNearbyTransfer {
  selfId: string | null;
  deviceName: string;
  devices: NearbyDevice[];
  crowded: boolean;
  session: NearbySession | null;
  incoming: IncomingRequest | null;
  /** Begin / continue sending `files` to a discovered (or active) device. */
  sendTo: (peerId: string, files: File[]) => void;
  /** Send a text snippet over the active session (no accept needed). */
  sendText: (text: string) => void;
  /** Accept the pending inbound file offer -> bytes flow into the tray. */
  acceptIncoming: () => void;
  /** Decline the pending inbound file offer -> nothing is received. */
  declineIncoming: () => void;
  /** Cancel an in-flight item (either direction). */
  cancel: (id: string) => void;
  /** Pause an in-flight item (sink stays open). */
  pause: (id: string) => void;
  /** Resume a paused item. */
  resume: (id: string) => void;
  /** Save one received file's blob via an anchor download. */
  downloadOne: (id: string) => void;
  /** Zip all received, done file-items into nearby-files.zip and download. */
  downloadAll: () => void;
  /** Rename this device; empty input falls back to "Device". */
  rename: (name: string) => void;
  /** Close the active session panel and tear the peer down. */
  dismissSession: () => void;
}


const PEER_ERROR_COPY: Record<string, string> = {
  "nat-failed": "Couldn't open a direct channel. One device may be on a restrictive network.",
  disconnected: "The other device disconnected before the transfer finished.",
  "channel-error": "The connection between the devices broke during the transfer. Hit retry to pair again.",
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useNearbyTransfer(): UseNearbyTransfer {
  const nearby = useNearby();
  const { selfId, devices, crowded, deviceName, connectTo, onIncoming, rename } = nearby;

  const [session, setSession] = useState<NearbySession | null>(null);
  const [incoming, setIncoming] = useState<IncomingRequest | null>(null);

  /** The peer backing the active session (so dismiss can close it). */
  const peerRef = useRef<WarpPeer | null>(null);
  /** Items kept in a ref too, so downloadOne/All resolve blobs without re-binding. */
  const itemsRef = useRef<TransferItem[]>([]);
  /** Name of the active session peer, for the accept prompt. */
  const peerNameRef = useRef<string>("Device");
  /** Discovery id of the active session peer. */
  const peerIdRef = useRef<string>("");
  /** Last files offered this session — resume re-offers from here. */
  const lastFilesRef = useRef<File[]>([]);

  // ---- session-state plumbing ---------------------------------------------

  const upsertItem = useCallback((item: TransferItem) => {
    setSession((prev) => {
      if (!prev) return prev;
      const idx = prev.items.findIndex((t) => t.id === item.id);
      const items = idx === -1 ? [...prev.items, item] : prev.items.slice();
      if (idx !== -1) items[idx] = item;
      itemsRef.current = items;
      return { ...prev, items };
    });
  }, []);

  const failSession = useCallback((message: string) => {
    setSession((prev) => (prev ? { ...prev, errorMessage: message } : prev));
  }, []);

  /** Bind a peer's lifecycle events into the active session. */
  const bindPeer = useCallback(
    (peer: WarpPeer) => {
      peer.on("connected", () =>
        setSession((prev) => (prev ? { ...prev, connected: true } : prev)),
      );
      peer.on("transfer", (item) => upsertItem(item));
      // A FILE offer arrived: surface the accept modal with the manifest.
      peer.on("incoming-offer", (info) =>
        setIncoming({
          peerId: peerIdRef.current,
          peerName: peerNameRef.current,
          batchId: info.batchId,
          items: info.items,
        }),
      );
      // Received files / text already arrive via "transfer" with the blob/text
      // attached; nothing extra to do here (no auto-download).
      peer.on("file-received", () => {});
      peer.on("text-received", () => {});
      peer.on("declined", () => {});
      peer.on("cancelled", () => {});
      peer.on("resume-requested", ({ id }) => {
        const item = itemsRef.current.find((t) => t.id === id);
        if (!item || item.direction !== "send" || item.status !== "paused") return;
        const file = lastFilesRef.current.find((f) => f.name === item.name && f.size === item.size);
        if (!file) return;
        setSession((prev) => {
          if (!prev) return prev;
          const items = prev.items.filter((t) => t.id !== id);
          itemsRef.current = items;
          return { ...prev, items };
        });
        void peer.offerFiles([file]).catch(() => failSession(PEER_ERROR_COPY["channel-error"]));
      });
      peer.on("error", (kind) => failSession(PEER_ERROR_COPY[kind] ?? "The transfer failed."));
    },
    [failSession, upsertItem],
  );

  /** Spin up a fresh session around a peer (or replace the current one). */
  const openSession = useCallback(
    (peer: WarpPeer, peerId: string, peerName: string) => {
      if (peerRef.current && peerRef.current !== peer) peerRef.current.close();
      peerRef.current = peer;
      peerNameRef.current = peerName;
      peerIdRef.current = peerId;
      itemsRef.current = [];
      setSession({ peerId, peerName, connected: peer.isConnected, items: [], errorMessage: null });
      bindPeer(peer);
    },
    [bindPeer],
  );

  // ---- inbound offers ------------------------------------------------------

  useEffect(() => {
    const off = onIncoming((conn: IncomingConnection) => {
      // A nearby device opened a channel to us. If we already have a DIFFERENT
      // active peer, refuse the new one (single 1:1 session in v1). If it's the
      // same peer reconnecting, or we're idle, adopt it as the session peer.
      if (peerRef.current && peerRef.current !== conn.peer) {
        conn.peer.close();
        return;
      }
      // Bind silently — the user is only prompted when a FILE offer arrives.
      openSession(conn.peer, conn.from, conn.name);
    });
    return off;
  }, [onIncoming, openSession]);

  const acceptIncoming = useCallback(() => {
    const req = incoming;
    setIncoming(null);
    if (!req) return;
    peerRef.current?.acceptOffer(req.batchId);
  }, [incoming]);

  const declineIncoming = useCallback(() => {
    const req = incoming;
    setIncoming(null);
    if (!req) return;
    peerRef.current?.declineOffer(req.batchId);
  }, [incoming]);

  // ---- outbound sends ------------------------------------------------------

  const sendTo = useCallback(
    (peerId: string, files: File[]) => {
      if (!files.length) return;
      const peerName = devices.find((d) => d.peerId === peerId)?.name ?? "Device";

      // Reuse the live session if it's already the same peer; otherwise open one.
      let peer = peerRef.current;
      const samePeer = peer && session?.peerId === peerId;
      if (!samePeer) {
        const fresh = connectTo(peerId);
        if (!fresh) {
          setSession({
            peerId,
            peerName,
            connected: false,
            items: [],
            errorMessage: "Network isn't ready yet — give it a second and try again.",
          });
          return;
        }
        peer = fresh;
        openSession(fresh, peerId, peerName);
      }
      if (!peer) return;
      const activePeer = peer;
      lastFilesRef.current = [...lastFilesRef.current, ...files];

      // Offer the files once the channel is open (offerFiles requires an open channel).
      const offer = () =>
        activePeer.offerFiles(files).catch(() => failSession(PEER_ERROR_COPY["channel-error"]));
      if (activePeer.isConnected) {
        void offer();
      } else {
        const offConnected = activePeer.on("connected", () => {
          offConnected();
          void offer();
        });
      }
    },
    [connectTo, devices, failSession, openSession, session],
  );

  const sendText = useCallback((text: string) => {
    const peer = peerRef.current;
    const clean = text.trim();
    if (!peer || !peer.isConnected || !clean) return;
    try {
      peer.sendText(clean);
    } catch {
      /* channel not open — ignore */
    }
  }, []);

  const cancel = useCallback((id: string) => {
    peerRef.current?.cancel(id);
  }, []);

  const pause = useCallback((id: string) => {
    peerRef.current?.pause(id);
  }, []);

  const resume = useCallback((id: string) => {
    const item = itemsRef.current.find((t) => t.id === id);
    const peer = peerRef.current;
    if (!item || item.status !== "paused" || !peer) return;
    if (item.direction === "send") {
      const file = lastFilesRef.current.find((f) => f.name === item.name && f.size === item.size);
      if (!file) return;
      setSession((prev) => {
        if (!prev) return prev;
        const items = prev.items.filter((t) => t.id !== id);
        itemsRef.current = items;
        return { ...prev, items };
      });
      peer.requestResume(id);
      void peer.offerFiles([file]).catch(() => failSession(PEER_ERROR_COPY["channel-error"]));
      return;
    }
    peer.requestResume(id);
  }, [failSession]);

  const downloadOne = useCallback((id: string) => {
    const item = itemsRef.current.find((t) => t.id === id);
    if (!item?.blob) return;
    saveBlob(item.blob, item.name);
  }, []);

  const downloadAll = useCallback(() => {
    const received = itemsRef.current.filter(
      (t) => t.direction === "receive" && t.kind === "file" && t.status === "done" && t.blob,
    );
    if (!received.length) return;

    // Shared streaming helper (issue #28): slice-by-slice archive build that
    // keeps the main thread responsive and avoids zipSync's 2×-memory spike.
    void streamZipDownload(
      received.map((t) => ({ name: t.name, blob: t.blob! })),
      "nearby-files.zip",
    ).catch(() => failSession("Couldn't build the zip."));
  }, [failSession]);

  const dismissSession = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    itemsRef.current = [];
    setIncoming(null);
    setSession(null);
  }, []);

  // #14: warn before the tab closes while bytes are in flight (LAN flow too).
  // Native beforeunload prompt only while something is transferring/
  // reconnecting/paused; removed the moment nothing is.
  const sessionItems = session?.items ?? [];
  const nearbyInFlight = sessionItems.some(
    (t) => t.status === "transferring" || t.status === "reconnecting" || t.status === "paused",
  );
  useEffect(() => {
    if (!nearbyInFlight) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [nearbyInFlight]);

  return useMemo(
    () => ({
      selfId,
      deviceName,
      devices,
      crowded,
      session,
      incoming,
      sendTo,
      sendText,
      acceptIncoming,
      declineIncoming,
      cancel,
      pause,
      resume,
      downloadOne,
      downloadAll,
      rename,
      dismissSession,
    }),
    [
      selfId,
      deviceName,
      devices,
      crowded,
      session,
      incoming,
      sendTo,
      sendText,
      acceptIncoming,
      declineIncoming,
      cancel,
      pause,
      resume,
      downloadOne,
      downloadAll,
      rename,
      dismissSession,
    ],
  );
}