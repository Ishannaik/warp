// End-to-end check of the signaling server: spawns it, drives real ws clients,
// asserts room creation, mesh notifications, relay, cross-room isolation, and leave.
// Run: node test.js   (exits non-zero on failure)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const PORT = 18080;
const URL = `ws://localhost:${PORT}`;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() {
  const ws = new WebSocket(URL);
  ws.queue = [];
  ws.waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    const i = ws.waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) ws.waiters.splice(i, 1)[0].resolve(msg);
    else ws.queue.push(msg);
  });
  return new Promise((res) => ws.on('open', () => res(ws)));
}

function next(ws, pred = () => true, ms = 1500) {
  const i = ws.queue.findIndex(pred);
  if (i >= 0) return Promise.resolve(ws.queue.splice(i, 1)[0]);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for message')), ms);
    ws.waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
  });
}

const sendj = (ws, o) => ws.send(JSON.stringify(o));

async function waitHealthy() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('server never became healthy');
}

async function run() {
  // 1. A creates a room.
  const a = await connect();
  sendj(a, { type: 'join' });
  const aJoined = await next(a, (m) => m.type === 'joined');
  assert.match(aJoined.room, /^[A-Z2-9]{6}$/, 'room code format');
  assert.deepEqual(aJoined.peers, [], 'first peer sees an empty room');

  // 2. B joins it -> B sees A in peers; A is told B joined.
  const b = await connect();
  sendj(b, { type: 'join', room: aJoined.room });
  const [bJoined, aPeerJoined] = await Promise.all([
    next(b, (m) => m.type === 'joined'),
    next(a, (m) => m.type === 'peer-joined'),
  ]);
  assert.deepEqual(bJoined.peers, [aJoined.selfId], 'second peer sees the first');
  assert.equal(aPeerJoined.peerId, bJoined.selfId, 'A notified of B');

  // 3. B signals A -> A receives it with a server-stamped `from`.
  sendj(b, { type: 'signal', to: aJoined.selfId, data: { sdp: 'hi' } });
  const relayed = await next(a, (m) => m.type === 'signal');
  assert.equal(relayed.from, bJoined.selfId, 'from is stamped to the real sender');
  assert.deepEqual(relayed.data, { sdp: 'hi' }, 'payload relayed intact');

  // 4. C in a different room cannot signal A.
  const c = await connect();
  sendj(c, { type: 'join' });
  const cJoined = await next(c, (m) => m.type === 'joined');
  assert.notEqual(cJoined.room, aJoined.room, 'C got its own room');
  sendj(c, { type: 'signal', to: aJoined.selfId, data: { sdp: 'leak?' } });
  await delay(300);
  assert.equal(a.queue.filter((m) => m.type === 'signal').length, 0, 'no cross-room leakage');

  // 5. B leaves -> A is told.
  b.close();
  const aPeerLeft = await next(a, (m) => m.type === 'peer-left');
  assert.equal(aPeerLeft.peerId, bJoined.selfId, 'A notified of B leaving');

  // 6. Error cases.
  const d = await connect();
  sendj(d, { type: 'join', room: 'abc' });
  assert.equal((await next(d, (m) => m.type === 'error')).error, 'bad-room', 'rejects bad format');
  sendj(d, { type: 'join', room: 'ZZZZZZ' });
  assert.equal((await next(d, (m) => m.type === 'error')).error, 'room-not-found', 'rejects missing room');

  for (const ws of [a, c, d]) ws.close();
}

const srv = spawn(process.execPath, ['signaling.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'inherit',
});

try {
  await waitHealthy();
  await run();
  console.log('\n✓ all signaling tests passed');
  process.exitCode = 0;
} catch (err) {
  console.error('\n✗ test failed:', err.message);
  process.exitCode = 1;
} finally {
  srv.kill();
}
