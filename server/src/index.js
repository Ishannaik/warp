// Warp signaling server — Cloudflare Worker + Durable Object (WebSocket Hibernation).
// Genuinely free (no card) on the Workers free plan. Wire protocol is identical to
// the original Node `ws` server: connect, then send {type:'join', room?} / {type:'signal', to, data}.

const MAX_PEERS = 8;                                       // mesh blows up past this; honest cap
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no ambiguous 0/O/1/I/L
const CODE_LEN = 6;
const ROOM_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('warp signaling server\n', { headers: { 'content-type': 'text/plain' } });
    }
    // One Durable Object holds all rooms. Plenty for a hobby signaling server;
    // shard by room (idFromName(roomCode)) later if you ever outgrow it.
    const id = env.SIGNALING.idFromName('global');
    return env.SIGNALING.get(id).fetch(request);
  },
};

export class SignalingRoom {
  constructor(state) {
    this.state = state;
  }

  async fetch() {
    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);                   // hibernation-enabled
    return new Response(null, { status: 101, webSocket: client });
  }

  // --- live-socket helpers ---------------------------------------------------
  // The sockets ARE the room state (hibernation-safe: nothing to desync).
  sockets(room, except) {
    return this.state.getWebSockets().filter((ws) => {
      const a = ws.deserializeAttachment();
      return a && a.room === room && ws !== except;
    });
  }

  roomExists(room) {
    return this.state.getWebSockets().some((ws) => {
      const a = ws.deserializeAttachment();
      return a && a.room === room;
    });
  }

  makeCode() {
    let code;
    do {
      const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
      code = '';
      for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    } while (this.roomExists(code));
    return code;
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch { /* socket gone */ }
  }

  // --- message handling ------------------------------------------------------
  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return this.send(ws, { type: 'error', error: 'bad-message', message: 'Expected JSON.' }); }
    if (!msg || typeof msg.type !== 'string') return this.send(ws, { type: 'error', error: 'bad-message' });

    if (msg.type === 'join') return this.handleJoin(ws, msg);
    if (msg.type === 'signal') return this.handleSignal(ws, msg);
    return this.send(ws, { type: 'error', error: 'unknown-type', message: msg.type });
  }

  handleJoin(ws, msg) {
    const prev = ws.deserializeAttachment();
    if (prev) this.notifyLeft(ws, prev);                  // one room per socket

    let code = msg.room;
    if (code == null) {
      code = this.makeCode();                             // no code given => create a room
    } else if (typeof code !== 'string' || !ROOM_RE.test(code)) {
      return this.send(ws, { type: 'error', error: 'bad-room', message: 'Invalid room code.' });
    } else if (!this.roomExists(code)) {
      return this.send(ws, { type: 'error', error: 'room-not-found', message: 'Room not found.' });
    } else if (this.sockets(code, null).length >= MAX_PEERS) {
      return this.send(ws, { type: 'error', error: 'room-full', message: `Room is full (max ${MAX_PEERS}).` });
    }

    const existing = this.sockets(code, ws);              // current members, before we join
    const peerId = crypto.randomUUID();
    ws.serializeAttachment({ peerId, room: code });

    // Glare-free mesh: the new peer offers to every existing peer; they wait.
    this.send(ws, { type: 'joined', selfId: peerId, room: code, peers: existing.map((p) => p.deserializeAttachment().peerId) });
    for (const p of existing) this.send(p, { type: 'peer-joined', peerId });
  }

  handleSignal(ws, msg) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    // Same-room only; `from` is server-stamped, so a client can't forge it.
    const target = this.sockets(a.room, ws).find((p) => p.deserializeAttachment().peerId === msg.to);
    if (target) this.send(target, { type: 'signal', from: a.peerId, data: msg.data });
  }

  notifyLeft(ws, a) {
    for (const p of this.sockets(a.room, ws)) this.send(p, { type: 'peer-left', peerId: a.peerId });
  }

  async webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    if (a) this.notifyLeft(ws, a);
  }

  async webSocketError(ws) {
    const a = ws.deserializeAttachment();
    if (a) this.notifyLeft(ws, a);
  }
}
