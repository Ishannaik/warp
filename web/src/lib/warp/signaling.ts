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

/**
 * Opaque WebRTC handshake payload (SDP offer/answer or ICE candidate), PLUS an
 * out-of-band `cancel`. Cancel rides the always-open signaling socket instead of
 * the data channel so it bypasses the up-to-16 MiB in-flight byte backlog and
 * reaches the other side within a network RTT (the in-band cancel still goes too;
 * both are idempotent). The server relays all of these opaquely — it never reads
 * `data`.
 */
export type SignalData =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: RTCIceCandidateInit }
  | { kind: "cancel"; id: string };

/** Messages we receive from the server, discriminated on `type`. */
export type ServerMessage =
  | { type: "joined"; selfId: string; room: string; peers: string[] }
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; from: string; data: SignalData }
  | { type: "error"; error: string };

/** Events the SignalingClient emits to its consumer (the transfer engine). */
export interface SignalingEvents {
  /** The underlying socket (re)opened — fires on first connect AND every
   *  auto-reconnect, so socket-level consumers (nearby announce) can re-attach. */
  open: () => void;
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
    open: new Set(),
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
  private keepalive: ReturnType<typeof setInterval> | null = null;

  /** The room `connect()` was asked for (undefined => create). Used to rejoin. */
  private joinRoom: string | undefined;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.closed = false;
    this.joinRoom = room;
    this.openSocket();
  }

  /**
   * (Re)open the underlying WebSocket and (re)join. On an UNEXPECTED close we
   * reconnect with exponential backoff and rejoin the same room — a signaling
   * blip (phone screen lock, network flap) must not kill the session; the room
   * survives on the server as long as any member's socket is up. We rejoin with
   * the server-assigned `this.room` when we have one (covers the creator, whose
   * original join had no code). A rejoin gets a fresh selfId — the mesh layer
   * treats us as a new device and rebuilds channels. After MAX attempts we give
   * up with a terminal "signaling-lost".
   */
  private openSocket(): void {
    const ws = new WebSocket(SIGNALING_URL);
    this.ws = ws;

    ws.addEventListener("open", () => {
      const room = this.room ?? this.joinRoom;
      const join = room ? { type: "join", room } : { type: "join" };
      this.rawSend(JSON.stringify(join));
      // Flush anything queued while connecting.
      for (const frame of this.pending) ws.send(frame);
      this.pending = [];
      // Keepalive: ping every 8s so the Durable Object never sits 10s idle and
      // hibernates — which was dropping a waiting room before the peer could join.
      this.keepalive = setInterval(() => this.rawSend(JSON.stringify({ type: "ping" })), 8000);
      this.emit("open");
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

    // A socket error is always followed by close; the close handler owns
    // recovery, so an error alone is no longer surfaced (it used to hard-fail
    // the whole session while a transfer was running fine).
    ws.addEventListener("error", () => {});

    ws.addEventListener("close", (ev) => {
      if (this.ws !== ws) return; // superseded by a newer socket
      this.ws = null;
      if (this.keepalive) { clearInterval(this.keepalive); this.keepalive = null; }
      this.emit("close", { code: ev.code, reason: ev.reason });
      if (!this.closed) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    if (this.reconnectAttempts >= 8) {
      this.emit("error", "signaling-lost");
      return;
    }
    const delay = Math.min(500 * 2 ** this.reconnectAttempts, 8000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed && !this.ws) this.openSocket();
    }, delay);
  }

  private dispatch(msg: ServerMessage): void {
    switch (msg.type) {
      case "joined":
        this.selfId = msg.selfId;
        this.room = msg.room;
        this.reconnectAttempts = 0; // healthy again — reset the backoff budget
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
    if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.keepalive) { clearInterval(this.keepalive); this.keepalive = null; }
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
