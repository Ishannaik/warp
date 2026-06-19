/**
 * LAN discovery presence hook.
 *
 * This hook keeps a *persistent* signaling socket open so this device is both
 * DISCOVERABLE (other same-IP devices see us in their `nearby` snapshot) and
 * READY to receive incoming WebRTC offers from those devices. It is the home
 * screen's "who's around me" radar — distinct from the code-room transfer flow
 * in `useWrapTransfer`.
 *
 * How it rides on top of the unmodified `SignalingClient`:
 *   - `SignalingClient.connect()` opens the socket and (harmlessly) joins a
 *     fresh room. Per the server contract a socket can be in a room AND
 *     announced at once, so we simply ignore room events and additionally send
 *     `{ type:'announce', name }` once the socket is open.
 *   - Discovery WebRTC reuses the existing `signal` plumbing: `sig.signal(to,…)`
 *     to send and the client's `"signal"` event to receive — `to`/`from` are the
 *     discovery `peerId`s, no room needed.
 *   - The server speaks two frames `SignalingClient` doesn't model (`announce`
 *     out, `nearby` in). Since we may not edit `signaling.ts`, we reach the live
 *     `WebSocket` it owns through a tiny typed escape hatch and attach our own
 *     `message` listener for `nearby` plus a raw `announce` send. Everything the
 *     client already understands keeps flowing through it untouched.
 *
 * Exposes a way to get the `SignalingClient` so the home UI can:
 *   (a) SEND  — `new WrapPeer(sig, targetPeerId, true)`, then `peer.start()` +
 *               `peer.offerFiles(files)` (gated by the receiver's accept).
 *   (b) RECEIVE — an unsolicited offer from a nearby peer (no peer yet) fires the
 *               `onIncoming` callback with the sender and a ready-to-accept
 *               responder `WrapPeer`; feed it the offer and bind your handlers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SignalingClient, type SignalData } from "./signaling";
import { WrapPeer } from "./peer";

const DEVICE_NAME_KEY = "wrap.deviceName";

/** A discoverable peer on the same public IP. */
export interface NearbyDevice {
  peerId: string;
  name: string;
}

/** Server -> client discovery snapshot. */
interface NearbyMessage {
  type: "nearby";
  selfId: string;
  devices: NearbyDevice[];
  crowded?: boolean;
}

/**
 * Fired when a nearby peer offers a connection and we have no peer for them yet.
 * The `peer` is a fresh responder already fed the inbound offer — bind your
 * transfer handlers (`peer.on('transfer'|'incoming-offer'|'file-received'|…)`).
 */
export interface IncomingConnection {
  /** Discovery peerId of the sender. */
  from: string;
  /** Best-effort display name of the sender (from the latest `nearby`). */
  name: string;
  /** Responder peer, primed with the offer; an answer is already in flight. */
  peer: WrapPeer;
}

export interface UseNearby {
  /** This device's own discovery id, or null until the first `nearby`. */
  selfId: string | null;
  /** Other discoverable devices on the same public IP (full snapshot). */
  devices: NearbyDevice[];
  /** True when the network is too crowded to auto-discover (use a code). */
  crowded: boolean;
  /** This device's advertised name. */
  deviceName: string;
  /** Rename this device and re-announce so peers see the new label. */
  rename: (name: string) => void;
  /**
   * Begin a send to a discovered device. Constructs an initiator `WrapPeer`,
   * kicks off the offer, and returns it so the caller can bind handlers and
   * `sendFiles`. Returns null if the socket isn't ready yet.
   */
  connectTo: (targetPeerId: string) => WrapPeer | null;
  /**
   * Register a handler for unsolicited incoming offers from nearby peers.
   * Returns an unsubscribe function. The handler receives a primed responder.
   */
  onIncoming: (fn: (conn: IncomingConnection) => void) => () => void;
  /** Escape hatch: the live SignalingClient (for advanced/manual wiring). */
  getSignaling: () => SignalingClient | null;
}

/** The private fields of SignalingClient we touch without modifying it. */
interface SignalingInternals {
  ws: WebSocket | null;
}

const ADJECTIVES = [
  "Amber", "Brisk", "Cobalt", "Dusky", "Ember", "Fleet", "Gilded", "Hazel",
  "Ivory", "Jade", "Keen", "Lunar", "Mossy", "Noble", "Onyx", "Plum",
  "Quartz", "Rusty", "Slate", "Teal", "Umber", "Velvet", "Warm", "Zephyr",
];
const NOUNS = [
  "Otter", "Falcon", "Maple", "Comet", "Heron", "Lynx", "Pylon", "Quokka",
  "Raven", "Tapir", "Willow", "Badger", "Cedar", "Drake", "Finch", "Glade",
];

/** Pick a stable, friendly "Adjective Noun" — falls back to Device-XXXX. */
function generateDeviceName(): string {
  try {
    const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${a} ${n}`;
  } catch {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `Device-${suffix}`;
  }
}

/** Read the persisted device name, minting + saving one on first run. */
function loadDeviceName(): string {
  try {
    const existing = localStorage.getItem(DEVICE_NAME_KEY);
    if (existing && existing.trim()) return existing;
  } catch {
    /* storage unavailable (private mode / SSR) — fall through to a fresh name */
  }
  const fresh = generateDeviceName();
  try {
    localStorage.setItem(DEVICE_NAME_KEY, fresh);
  } catch {
    /* best-effort persistence */
  }
  return fresh;
}

export function useNearby(): UseNearby {
  const [selfId, setSelfId] = useState<string | null>(null);
  const [devices, setDevices] = useState<NearbyDevice[]>([]);
  const [crowded, setCrowded] = useState(false);
  const [deviceName, setDeviceName] = useState<string>(() => loadDeviceName());

  const sigRef = useRef<SignalingClient | null>(null);
  /** Latest snapshot, kept in a ref so callbacks resolve names without re-binding. */
  const devicesRef = useRef<NearbyDevice[]>([]);
  /** Discovery peers we already have a WrapPeer for (send or receive). */
  const peersRef = useRef<Map<string, WrapPeer>>(new Map());
  /** Consumers listening for unsolicited incoming offers. */
  const incomingListeners = useRef<Set<(conn: IncomingConnection) => void>>(new Set());
  /** Always-current name for re-announce / open handlers without re-binding. */
  const nameRef = useRef<string>(deviceName);
  nameRef.current = deviceName;

  /** Raw-send an arbitrary frame on the live socket (announce isn't modeled). */
  const rawSend = useCallback((frame: object): boolean => {
    const sig = sigRef.current;
    if (!sig) return false;
    const ws = (sig as unknown as SignalingInternals).ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
      return true;
    }
    return false;
  }, []);

  /** Send our announce frame (queued by retry-on-open if the socket is cold). */
  const announce = useCallback(
    (name: string) => rawSend({ type: "announce", name }),
    [rawSend],
  );

  const nameFor = useCallback((peerId: string): string => {
    return devicesRef.current.find((d) => d.peerId === peerId)?.name ?? "Device";
  }, []);

  const connectTo = useCallback(
    (targetPeerId: string): WrapPeer | null => {
      const sig = sigRef.current;
      if (!sig) return null;
      // Reuse an existing peer for this target if one is already live.
      const existing = peersRef.current.get(targetPeerId);
      if (existing) return existing;

      const peer = new WrapPeer(sig, targetPeerId, true);
      peersRef.current.set(targetPeerId, peer);
      peer.start().catch(() => {
        /* surfaced to the caller via peer.on('error'); drop our handle */
        peersRef.current.delete(targetPeerId);
      });
      return peer;
    },
    [],
  );

  const onIncoming = useCallback((fn: (conn: IncomingConnection) => void) => {
    incomingListeners.current.add(fn);
    return () => {
      incomingListeners.current.delete(fn);
    };
  }, []);

  const getSignaling = useCallback(() => sigRef.current, []);

  const rename = useCallback(
    (name: string) => {
      const clean = name.trim().slice(0, 40) || "Device";
      setDeviceName(clean);
      nameRef.current = clean;
      try {
        localStorage.setItem(DEVICE_NAME_KEY, clean);
      } catch {
        /* best-effort */
      }
      // Re-announce so same-IP peers receive a fresh snapshot with the new name.
      announce(clean);
    },
    [announce],
  );

  // Persistent presence: open one socket for the hook's lifetime.
  useEffect(() => {
    const sig = new SignalingClient();
    sigRef.current = sig;
    // Stable handle to the live-peer map for the cleanup closure.
    const peers = peersRef.current;

    // `nearby` is a frame SignalingClient doesn't dispatch; tap the raw socket.
    // We poll briefly for the ws (it's created synchronously inside connect()).
    let detachNearby: (() => void) | null = null;
    const attachNearbyListener = () => {
      const ws = (sig as unknown as SignalingInternals).ws;
      if (!ws) return false;
      const onMessage = (ev: MessageEvent) => {
        if (typeof ev.data !== "string") return;
        let msg: NearbyMessage | { type?: string };
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg && (msg as NearbyMessage).type === "nearby") {
          const m = msg as NearbyMessage;
          setSelfId(m.selfId ?? null);
          setCrowded(Boolean(m.crowded));
          const next = Array.isArray(m.devices) ? m.devices : [];
          devicesRef.current = next;
          setDevices(next);
        }
      };
      ws.addEventListener("message", onMessage);
      detachNearby = () => ws.removeEventListener("message", onMessage);
      return true;
    };

    // Incoming discovery offers ride the client's existing `signal` event.
    const offSignal = sig.on(
      "signal",
      ({ from, data }: { from: string; data: SignalData }) => {
        const existing = peersRef.current.get(from);
        if (existing) {
          existing.handleSignal(from, data).catch(() => {
            /* error surfaces via the peer's own error event */
          });
          return;
        }
        // No peer yet: only an OFFER should bootstrap a responder. Ignore stray
        // answers/ICE for an unknown peer (e.g. arrived after teardown).
        if (data.kind !== "offer") return;

        const peer = new WrapPeer(sig, from, false);
        peersRef.current.set(from, peer);
        peer.handleSignal(from, data).catch(() => {
          peersRef.current.delete(from);
        });
        const conn: IncomingConnection = { from, name: nameFor(from), peer };
        for (const fn of incomingListeners.current) {
          try {
            fn(conn);
          } catch {
            /* a misbehaving listener shouldn't break discovery */
          }
        }
      },
    );

    // Re-announce whenever the socket (re)opens. SignalingClient attaches its
    // own "open" handler that sends `join`; we add ours for `announce`.
    const onOpen = () => announce(nameRef.current);

    // Open the socket (no room -> server mints a throwaway room we ignore).
    sig.connect();

    // The ws is created synchronously in connect(); attach listeners now, and
    // retry once on the next tick in case of any timing surprise.
    const wsNow = (sig as unknown as SignalingInternals).ws;
    if (wsNow) {
      wsNow.addEventListener("open", onOpen);
      attachNearbyListener();
      // If it's already open (reconnected client), announce immediately.
      if (wsNow.readyState === WebSocket.OPEN) announce(nameRef.current);
    }

    return () => {
      offSignal();
      detachNearby?.();
      const ws = (sig as unknown as SignalingInternals).ws;
      ws?.removeEventListener("open", onOpen);
      for (const p of peers.values()) p.close();
      peers.clear();
      sig.close();
      sigRef.current = null;
    };
    // Mount-once: the socket is a persistent presence for the hook's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return useMemo(
    () => ({
      selfId,
      devices,
      crowded,
      deviceName,
      rename,
      connectTo,
      onIncoming,
      getSignaling,
    }),
    [selfId, devices, crowded, deviceName, rename, connectTo, onIncoming, getSignaling],
  );
}
