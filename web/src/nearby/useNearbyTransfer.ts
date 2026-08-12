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

  rename: (name: string) => void;
  sessions: NearbySession[];
  incoming: IncomingRequest[];
  /** Begin / continue sending `files` to a discovered (or active) device. */
  sendTo: (peerId: string | string[], files: File[]) => void;
  /** Send a text snippet over the active session (no accept needed). */
  sendText: (peerId: string, text: string) => void;
  acceptIncoming: (peerId: string) => void;
  declineIncoming: (peerId: string) => void;
  cancel: (peerId: string, id: string) => void;
  downloadOne: (peerId: string, id: string) => void;
  downloadAll: (peerId: string) => void;
  dismissSession: (peerId: string) => void;
}


const PEER_ERROR_COPY: Record<string, string> = {
  "nat-failed": "Couldn't open a direct channel. One device may be on a restrictive network.",
  disconnected: "The other device disconnected before the transfer finished.",
  "channel-error": "The direct link to the other device broke.",
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

  const [sessions, setSessions] = useState<NearbySession[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);


  /** One live peer per nearby device. */
  const peersRef = useRef<Map<string, WarpPeer>>(new Map());

  /** Items kept per peer so downloads resolve the correct blobs. */
  const itemsRef = useRef<Map<string, TransferItem[]>>(new Map());

  /** Display names keyed by discovery peer id. */
  const peerNamesRef = useRef<Map<string, string>>(new Map());

  // ---- session-state plumbing ---------------------------------------------

  const upsertItem = useCallback((peerId: string, item: TransferItem) => {
  const currentItems = itemsRef.current.get(peerId) ?? [];
  const idx = currentItems.findIndex((t) => t.id === item.id);
  const items = idx === -1 ? [...currentItems, item] : currentItems.slice();

  if (idx !== -1) {
    items[idx] = item;
  }

  itemsRef.current.set(peerId, items);

  setSessions((prev) => {
    const session = prev.find((s) => s.peerId === peerId);
    if (!session) return prev;

    return prev.map((s) =>
      s.peerId === peerId ? { ...s, items } : s,
    );
  });
  }, []);

  const failSession = useCallback((peerId: string, message: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.peerId === peerId
          ? { ...session, errorMessage: message }
          : session,
      ),
    );
  }, []);

  /** Bind a peer's lifecycle events into the active session. */
  const bindPeer = useCallback(

    (peer: WarpPeer, peerId: string, peerName: string) => {
      peer.on("connected", () =>
        setSessions((prev) =>
          prev.map((session) =>
            session.peerId === peerId
              ? { ...session, connected: true }
              : session,
          ),
        ),
      );
      peer.on("transfer", (item) => upsertItem(peerId, item));
      // A FILE offer arrived: surface the accept modal with the manifest.
      peer.on("incoming-offer", (info) =>
        setIncoming((prev) => [
           ...prev.filter((request) => request.peerId !== peerId),
          {
            peerId,
            peerName,
            batchId: info.batchId,
            items: info.items,
          },
        ]),
      );
      // Received files / text already arrive via "transfer" with the blob/text
      // attached; nothing extra to do here (no auto-download).
      peer.on("file-received", () => {});
      peer.on("text-received", () => {});
      peer.on("declined", () => {});
      peer.on("cancelled", () => {});
      

      peer.on(
        "error",
        (kind) => failSession(peerId, PEER_ERROR_COPY[kind] ?? "The transfer failed."),
      );
    },
    [failSession, upsertItem],
  );

  /** Spin up a fresh session around a peer (or replace the current one). */
  const openSession = useCallback(
  (peer: WarpPeer, peerId: string, peerName: string) => {
    const existing = peersRef.current.get(peerId);

    if (existing === peer) {
      return;
    }

    if (existing) {
      existing.close();
    }

    peersRef.current.set(peerId, peer);
    peerNamesRef.current.set(peerId, peerName);

    if (!itemsRef.current.has(peerId)) {
      itemsRef.current.set(peerId, []);
    }

    setSessions((prev) => {
      const existingSession = prev.find((s) => s.peerId === peerId);

      if (existingSession) {
        return prev.map((s) =>
          s.peerId === peerId
            ? {
                ...s,
                peerName,
                connected: peer.isConnected,
                errorMessage: null,
              }
            : s,
        );
      }

      return [
        ...prev,
        {
          peerId,
          peerName,
          connected: peer.isConnected,
          items: itemsRef.current.get(peerId) ?? [],
          errorMessage: null,
        },
      ];
    });

    bindPeer(peer, peerId, peerName);
  },
  [bindPeer],
);

  // ---- inbound offers ------------------------------------------------------

  useEffect(() => {
    const off = onIncoming((conn: IncomingConnection) => {
      openSession(conn.peer, conn.from, conn.name);
    });

    return off;
  }, [onIncoming, openSession]);
  const acceptIncoming = useCallback(
    (peerId: string) => {
      const req = incoming.find((request) => request.peerId === peerId);
      if (!req) return;

      setIncoming((prev) =>
        prev.filter((request) => request.peerId !== peerId),
      );

      peersRef.current.get(peerId)?.acceptOffer(req.batchId);
    },
    [incoming],
  );

  const declineIncoming = useCallback(
    (peerId: string) => {
      const req = incoming.find((request) => request.peerId === peerId);
      if (!req) return;

      setIncoming((prev) =>
        prev.filter((request) => request.peerId !== peerId),
      );

      peersRef.current.get(peerId)?.declineOffer(req.batchId);
    },
    [incoming],
  );

  // ---- outbound sends ------------------------------------------------------

  const sendTo = useCallback(
    (peerIds: string | string[], files: File[]) => {
      if (!files.length) return;

      const targets = Array.isArray(peerIds) ? peerIds : [peerIds];

      for (const peerId of targets) {
        const peerName =
          devices.find((device) => device.peerId === peerId)?.name ??
          peerNamesRef.current.get(peerId) ??
          "Device";

        let peer = peersRef.current.get(peerId);

        if (!peer) {
          const fresh = connectTo(peerId);

          if (!fresh) {
            setSessions((prev) => {
              const existing = prev.find((s) => s.peerId === peerId);

              if (existing) {
                return prev.map((s) =>
                  s.peerId === peerId
                    ? {
                        ...s,
                        connected: false,
                        errorMessage:
                          "Network isn't ready yet — give it a second and try again.",
                      }
                    : s,
                );
              }

              return [
                ...prev,
                {
                  peerId,
                  peerName,
                  connected: false,
                  items: [],
                  errorMessage:
                    "Network isn't ready yet — give it a second and try again.",
                },
              ];
            });

            continue;
          }

          peer = fresh;
          openSession(peer, peerId, peerName);
        }

        if (!peer) continue;

        const activePeer = peer;

        

        const offer = () =>
          activePeer
            .offerFiles(files)
            .catch(() =>
              failSession(
                peerId,
                PEER_ERROR_COPY["channel-error"] ?? "The data channel hit an error.",
              ),
            );

        if (activePeer.isConnected) {
          void offer();
        } else {
          const offConnected = activePeer.on("connected", () => {
            offConnected();
            void offer();
          });
        }
           
      }
    },
    [connectTo, devices, failSession, openSession],
  );

  const sendText = useCallback((peerId: string, text: string) => {
    const peer = peersRef.current.get(peerId);
    const clean = text.trim();

    if (!peer || !peer.isConnected || !clean) return;

    try {
      peer.sendText(clean);
    } catch {
      /* channel not open — ignore */
    }
  }, []);

  const cancel = useCallback((peerId: string, id: string) => {
    peersRef.current.get(peerId)?.cancel(id);
  }, []);

  const pause = useCallback((peerId: string, id: string) => {
    peersRef.current.get(peerId)?.pause(id);
  }, []);

  const resume = useCallback((peerId: string, id: string) => {
    const item = itemsRef.current.get(peerId)?.find((t) => t.id === id);
    const peer = peersRef.current.get(peerId);

    if (!item || item.status !== "paused" || !peer) return;

    if (item.direction === "send") {
      
      return;
    }

    peer.requestResume(id);
  }, [failSession]);

  const downloadOne = useCallback((peerId: string, id: string) => {
    const item = itemsRef.current
      .get(peerId)
      ?.find((t) => t.id === id);
    if (!item?.blob) return;

    saveBlob(item.blob, item.name);
  }, []);

  const downloadAll = useCallback(
    (peerId: string) => {
      const received =
        itemsRef.current
          .get(peerId)
          ?.filter(
            (t: TransferItem) =>
              t.direction === "receive" &&
              t.kind === "file" &&
              t.status === "done" &&
              t.blob,
          ) ?? [];

      if (!received.length) return;

      void streamZipDownload(
        received.map((t) => ({
          name: t.name,
          blob: t.blob!,
        })),
        "nearby-files.zip",
      ).catch(() =>
        failSession(peerId, "Couldn't build the zip."),
      );
    },
    [failSession],
  );
  const dismissSession = useCallback((peerId: string) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);

    itemsRef.current.delete(peerId);
    peerNamesRef.current.delete(peerId);

    setIncoming((prev) =>
      prev.filter((request) => request.peerId !== peerId),
    );

    

    setSessions((prev) =>
      prev.filter((session) => session.peerId !== peerId),
    );
  }, []);

  // #14: warn before the tab closes while bytes are in flight (LAN flow too).
  // Native beforeunload prompt only while something is transferring/
  // reconnecting/paused; removed the moment nothing is.
  const sessionItems = sessions.flatMap((session) => session.items);
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
      sessions,
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
      sessions,
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