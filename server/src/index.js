// Warp signaling server — Cloudflare Worker + Durable Object (WebSocket Hibernation).
// Genuinely free (no card) on the Workers free plan. Wire protocol is identical to
// the original Node `ws` server: connect, then send {type:'join', room?} / {type:'signal', to, data}.

const MAX_PEERS = 8;                                       // mesh blows up past this; honest cap
const MAX_DISCOVER = 8;                                    // >this many sockets per public IP => CGNAT/cellular; hide devices (privacy)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no ambiguous 0/O/1/I/L
const CODE_LEN = 6;
const ROOM_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`);
const RECLAIM_MS = 3 * 60 * 1000;                         // reserve a code ~3 min after its last socket drops (H6=A)

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

  async fetch(request) {
    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);                   // hibernation-enabled
    // Stamp the client's public IP so LAN auto-discovery can group same-network peers.
    // Lives in the attachment, so it survives hibernation alongside room/peerId.
    let ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    // IPv6: group by the /64 prefix (first 4 hextets). Every device on a LAN gets its
    // OWN full IPv6, so grouping by the whole address would never match peers — the /64
    // is the shared-network unit (mirrors PairDrop's IPV6_LOCALIZE=4).
    if (ip.includes(':')) ip = ip.split(':').slice(0, 4).join(':');
    server.serializeAttachment({ ip });
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

    if (msg.type === 'ping') return; // keepalive — receiving it keeps the DO awake so it won't hibernate (10s) and drop a waiting room
    if (msg.type === 'join') return this.handleJoin(ws, msg);
    if (msg.type === 'announce') return this.handleAnnounce(ws, msg);
    if (msg.type === 'signal') return this.handleSignal(ws, msg);
    return this.send(ws, { type: 'error', error: 'unknown-type', message: msg.type });
  }

  async handleJoin(ws, msg) {
    const prev = ws.deserializeAttachment();
    if (prev && prev.room != null) this.notifyLeft(ws, prev); // one room per socket; ignore an ip-only attachment

    let code = msg.room;
    if (code == null) {
      code = this.makeCode();                             // no code given => create a room
    } else if (typeof code !== 'string' || !ROOM_RE.test(code)) {
      return this.send(ws, { type: 'error', error: 'bad-room', message: 'Invalid room code.' });
    } else if (!this.roomExists(code)) {
      // Room has no live sockets — but if it was reserved within the reclaim window
      // (both devices dropped at once, e.g. a shared tunnel), resurrect it under the
      // SAME code so they can rejoin and resume (H6=A). Re-validate expiry on read
      // (an alarm can be delayed/coalesced). No transfer state is restored — the
      // client registry + resumeToken carry the file resume; the server only owes
      // the same rendezvous code.
      const rec = await this.state.storage.get('reclaim:' + code);
      if (!rec || rec.expiresAt < Date.now()) {
        return this.send(ws, { type: 'error', error: 'room-not-found', message: 'Room not found.' });
      }
      await this.state.storage.delete('reclaim:' + code); // first reclaim-join wins; the second sees a live room
    } else if (this.sockets(code, null).length >= MAX_PEERS) {
      return this.send(ws, { type: 'error', error: 'room-full', message: `Room is full (max ${MAX_PEERS}).` });
    }

    const existing = this.sockets(code, ws);              // current members, before we join
    const peerId = crypto.randomUUID();
    ws.serializeAttachment({ ip: prev && prev.ip, peerId, room: code }); // keep ip; room flow ignores it

    // Glare-free mesh: the new peer offers to every existing peer; they wait.
    this.send(ws, { type: 'joined', selfId: peerId, room: code, peers: existing.map((p) => p.deserializeAttachment().peerId) });
    for (const p of existing) this.send(p, { type: 'peer-joined', peerId });
  }

  handleAnnounce(ws, msg) {
    const prev = ws.deserializeAttachment() || {};
    const peerId = crypto.randomUUID();
    ws.serializeAttachment({
      ip: prev.ip,                                        // keep the IP stamped at connect time
      peerId,
      name: String(msg.name || 'Device').slice(0, 40),
      discoverable: true,
    });
    this.broadcastNearby(prev.ip);
  }

  // Everyone discoverable on the same public IP. Privacy guardrail: if the group is
  // bigger than MAX_DISCOVER, the network is shared (CGNAT/cellular) — hide the list.
  broadcastNearby(ip) {
    const group = this.state.getWebSockets().filter((ws) => {
      const a = ws.deserializeAttachment();
      return a && a.discoverable === true && a.ip === ip;
    });
    if (group.length > MAX_DISCOVER) {
      for (const m of group) {
        const a = m.deserializeAttachment();
        this.send(m, { type: 'nearby', selfId: a.peerId, devices: [], crowded: true });
      }
      return;
    }
    for (const m of group) {
      const a = m.deserializeAttachment();
      const devices = group
        .filter((x) => x !== m)
        .map((x) => {
          const xa = x.deserializeAttachment();
          return { peerId: xa.peerId, name: xa.name };
        });
      this.send(m, { type: 'nearby', selfId: a.peerId, devices });
    }
  }

  handleSignal(ws, msg) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    // Relay to the target peer if it's reachable from this sender: either same room,
    // or both discoverable on the same public IP. `from` is server-stamped (no forging).
    const target = this.state.getWebSockets().find((p) => {
      if (p === ws) return false;
      const pa = p.deserializeAttachment();
      if (!pa || pa.peerId !== msg.to) return false;
      const sameRoom = a.room != null && pa.room === a.room;
      const sameNetwork = a.discoverable && pa.discoverable && a.ip === pa.ip;
      return sameRoom || sameNetwork;
    });
    if (target) this.send(target, { type: 'signal', from: a.peerId, data: msg.data });
  }

  notifyLeft(ws, a) {
    for (const p of this.sockets(a.room, ws)) this.send(p, { type: 'peer-left', peerId: a.peerId });
  }

  async handleGone(ws) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    if (a.room != null) {
      this.notifyLeft(ws, a);                             // room flow: tell peers it left
      // If this was the LAST socket in the room, reserve the code for ~3 min so a
      // both-sides drop can rejoin the SAME code and resume (H6=A). The DO isn't
      // evicted mid-storage-op (output gate holds it until the put is durable), so
      // awaiting here is safe and avoids losing the record to hibernation.
      if (this.sockets(a.room, ws).length === 0) {
        const expiresAt = Date.now() + RECLAIM_MS;
        await this.state.storage.put('reclaim:' + a.room, { code: a.room, expiresAt });
        await this.state.storage.setAlarm(expiresAt);
      }
    }
    // The socket is closing, so it's already excluded from getWebSockets() by the time
    // the recompute runs; broadcasting on its IP refreshes the rest of the nearby group.
    if (a.discoverable) this.broadcastNearby(a.ip);
  }

  // GC expired reclaim records. The alarm is best-effort (can be delayed/coalesced),
  // so reads also re-validate expiry — this just stops stale reservations piling up.
  async alarm() {
    const now = Date.now();
    const recs = await this.state.storage.list({ prefix: 'reclaim:' });
    for (const [k, v] of recs) {
      if (!v || v.expiresAt <= now) await this.state.storage.delete(k);
    }
  }

  async webSocketClose(ws) {
    await this.handleGone(ws);
  }

  async webSocketError(ws) {
    await this.handleGone(ws);
  }
}
