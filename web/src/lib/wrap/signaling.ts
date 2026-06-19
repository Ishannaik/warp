/**
 * Typed client for the Wrap signaling server.
 *
 * Transport: a single WebSocket to the live Cloudflare Worker. The server is a
 * dumb relay — it assigns a `selfId`, owns rooms, and forwards opaque `signal`
 * payloads (SDP / ICE) between peers. No media or file bytes ever touch it; it
 * only brokers the WebRTC handshake.
 *
 * Protocol (client -> server):
 *   { type: 'join' }                 create a fresh room, become its first peer
 *   { type: 'join', room: CODE }     join an existing room by code
 *   { type: 'signal', to, data }     relay an opaque payload to one peer
 *
 * Protocol (server -> client):
 *   { type: 'joined', selfId, room, peers }   ack of our join (peers = existing)
 *   { type: 'peer-joined', peerId }           someone else joined our room
 *   { type: 'peer-left', peerId }             someone else left
 *   { type: 'signal', from, data }            a relayed payload from `from`
 *   { type: 'error', error }                  server-side failure
 */

const SIGNALING_URL = "wss://warp-signaling.ishannaik7.workers.dev";

/** Opaque WebRTC handshake payload (SDP offer/answer or ICE candidate). */
export type SignalData =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: RTCIceCandidateInit };

/** Messages we receive from the server, discriminated on `type`. */
export type ServerMessage =
  | { type: "joined"; selfId: string; room: string; peers: string[] }
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; from: string; data: SignalData }
  | { type: "error"; error: string };

/** Events the SignalingClient emits to its consumer (the transfer engine). */
export interface SignalingEvents {
  /** Socket is open and our join has been acknowledged. */
  joined: (info: { selfId: string; room: string; peers: string[] }) => void;
  "peer-joined": (peerId: string) => void;
  "peer-left": (peerId: string) => void;
  signal: (msg: { from: string; data: SignalData }) => void;
  error: (error: string) => void;
  /** The underlying socket closed (network drop or server close). */
  close: (info: { code: number; reason: string }) => void;
}

type Listener<K extends keyof SignalingEvents> = SignalingEvents[K];

export class SignalingClient {
  private ws: WebSocket | null = null;
  private listeners: { [K in keyof SignalingEvents]: Set<Listener<K>> } = {
    joined: new Set(),
    "peer-joined": new Set(),
    "peer-left": new Set(),
    signal: new Set(),
    error: new Set(),
    close: new Set(),
  };

  /** Queue of frames sent before the socket finished opening. */
  private pending: string[] = [];
  private closed = false;

  selfId: string | null = null;
  room: string | null = null;

  on<K extends keyof SignalingEvents>(event: K, fn: Listener<K>): () => void {
    this.listeners[event].add(fn);
    return () => this.listeners[event].delete(fn);
  }

  private emit<K extends keyof SignalingEvents>(
    event: K,
    ...args: Parameters<Listener<K>>
  ): void {
    for (const fn of this.listeners[event]) {
      (fn as (...a: unknown[]) => void)(...args);
    }
  }

  /** Open the socket and send the initial join frame (room omitted => create). */
  connect(room?: string): void {
    if (this.ws) return;
    const ws = new WebSocket(SIGNALING_URL);
    this.ws = ws;

    ws.addEventListener("open", () => {
      const join = room ? { type: "join", room } : { type: "join" };
      this.rawSend(JSON.stringify(join));
      // Flush anything queued while connecting.
      for (const frame of this.pending) ws.send(frame);
      this.pending = [];
    });

    ws.addEventListener("message", (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : "") as ServerMessage;
      } catch {
        return;
      }
      this.dispatch(msg);
    });

    ws.addEventListener("error", () => {
      if (!this.closed) this.emit("error", "signaling-socket-error");
    });

    ws.addEventListener("close", (ev) => {
      this.emit("close", { code: ev.code, reason: ev.reason });
    });
  }

  private dispatch(msg: ServerMessage): void {
    switch (msg.type) {
      case "joined":
        this.selfId = msg.selfId;
        this.room = msg.room;
        this.emit("joined", { selfId: msg.selfId, room: msg.room, peers: msg.peers ?? [] });
        break;
      case "peer-joined":
        this.emit("peer-joined", msg.peerId);
        break;
      case "peer-left":
        this.emit("peer-left", msg.peerId);
        break;
      case "signal":
        this.emit("signal", { from: msg.from, data: msg.data });
        break;
      case "error":
        this.emit("error", msg.error);
        break;
    }
  }

  /** Relay an opaque handshake payload to a specific peer. */
  signal(to: string, data: SignalData): void {
    this.send(JSON.stringify({ type: "signal", to, data }));
  }

  private send(frame: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(frame);
    } else {
      this.pending.push(frame);
    }
  }

  private rawSend(frame: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(frame);
  }

  close(): void {
    this.closed = true;
    this.pending = [];
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* already closing */
      }
      this.ws = null;
    }
  }
}
