import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

// --- Config -----------------------------------------------------------------
const PORT = process.env.PORT || 8080;
const MAX_PEERS = Number(process.env.MAX_PEERS || 8);       // mesh blows up past this; honest cap
const MAX_PAYLOAD = 64 * 1024;                              // SDP/ICE are small; cap to stop abuse
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';    // no ambiguous 0/O/1/I/L
const CODE_LEN = 6;
const ROOM_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`); // stays in sync with the alphabet

// room code -> Map(peerId -> ws). All state is in-memory and dies with the process.
// ponytail: single-instance only. Add Redis pub/sub to run multiple instances if you outgrow one.
const rooms = new Map();

// --- Helpers ----------------------------------------------------------------
function makeCode() {
  let code;
  do {
    const bytes = crypto.randomBytes(CODE_LEN);
    code = '';
    for (let i = 0; i < CODE_LEN; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  } while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function leaveRoom(ws) {
  const room = rooms.get(ws.room);
  if (!room) return;
  room.delete(ws.peerId);
  for (const peer of room.values()) send(peer, { type: 'peer-left', peerId: ws.peerId });
  if (room.size === 0) rooms.delete(ws.room);   // empty rooms evaporate
  ws.room = null;
}

// --- Message handlers -------------------------------------------------------
function handleJoin(ws, msg) {
  if (ws.room) leaveRoom(ws);                   // one room per socket

  let code = msg.room;
  if (code == null) {
    code = makeCode();                          // no code given => create a fresh room
    rooms.set(code, new Map());
  } else if (typeof code !== 'string' || !ROOM_RE.test(code)) {
    return send(ws, { type: 'error', error: 'bad-room', message: 'Invalid room code.' });
  } else if (!rooms.has(code)) {
    return send(ws, { type: 'error', error: 'room-not-found', message: 'Room not found.' });
  } else if (rooms.get(code).size >= MAX_PEERS) {
    return send(ws, { type: 'error', error: 'room-full', message: `Room is full (max ${MAX_PEERS}).` });
  }

  const room = rooms.get(code);
  const peers = [...room.keys()];               // existing peers, before we add ourselves
  ws.peerId = crypto.randomUUID();
  ws.room = code;
  room.set(ws.peerId, ws);

  // Glare-free mesh: the NEW peer offers to every existing peer; existing peers wait.
  send(ws, { type: 'joined', selfId: ws.peerId, room: code, peers });
  for (const id of peers) send(room.get(id), { type: 'peer-joined', peerId: ws.peerId });
}

function handleSignal(ws, msg) {
  if (!ws.room) return;
  const room = rooms.get(ws.room);
  if (!room) return;
  const target = room.get(msg.to);              // same-room only: can't signal across rooms
  if (!target) return;                          // unknown/gone peer => drop silently
  // `from` is server-stamped, so a client can't forge who a message is from.
  send(target, { type: 'signal', from: ws.peerId, data: msg.data });
}

// --- Server -----------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('beam signaling server\n');
});

const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return send(ws, { type: 'error', error: 'bad-message', message: 'Expected JSON.' }); }
    if (!msg || typeof msg.type !== 'string') return send(ws, { type: 'error', error: 'bad-message' });

    switch (msg.type) {
      case 'join':   return handleJoin(ws, msg);
      case 'signal': return handleSignal(ws, msg);
      default:       return send(ws, { type: 'error', error: 'unknown-type', message: msg.type });
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => {});                      // 'close' fires after; nothing to do here
});

// Drop sockets that stopped answering pings (stale tabs would otherwise leak rooms).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => console.log(`signaling on :${PORT}`));
process.on('SIGTERM', () => { server.close(); process.exit(0); });  // clean shutdown on deploy
