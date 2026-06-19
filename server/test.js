// End-to-end check of the signaling Worker: boots `wrangler dev` (local workerd),
// drives real WebSocket clients, and asserts room creation, mesh notifications,
// relay, cross-room isolation, leave, and error cases.
// Uses Node's built-in global WebSocket + fetch (Node 22) — no client deps.
// Run: node test.js   (exits non-zero on failure)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 18787;
const REMOTE = process.env.TEST_WS_URL;        // set to test against a deployed wss:// URL
const HTTP = `http://localhost:${PORT}`;
const WS = REMOTE ?? `ws://localhost:${PORT}`;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() {
  const ws = new WebSocket(WS);
  ws.queue = [];
  ws.waiters = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const i = ws.waiters.findIndex((w) => w.pred(msg));
    if (i >= 0) ws.waiters.splice(i, 1)[0].resolve(msg);
    else ws.queue.push(msg);
  });
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('ws open timeout')), 8000);
    ws.addEventListener('open', () => { clearTimeout(t); res(ws); });
    ws.addEventListener('error', () => { clearTimeout(t); rej(new Error('ws connect failed')); });
  });
}

function next(ws, pred = () => true, ms = 2000) {
  const i = ws.queue.findIndex(pred);
  if (i >= 0) return Promise.resolve(ws.queue.splice(i, 1)[0]);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for message')), ms);
    ws.waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
  });
}

const sendj = (ws, o) => ws.send(JSON.stringify(o));

async function waitHealthy() {
  for (let i = 0; i < 120; i++) {              // wrangler dev can take a while to boot workerd
    try { if ((await fetch(`${HTTP}/health`)).ok) return; } catch { /* not up yet */ }
    await delay(500);
  }
  throw new Error('wrangler dev never became healthy');
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

// Local mode boots `wrangler dev`; remote mode (TEST_WS_URL set) tests a deployed Worker.
// `pnpm exec` resolves the workspace's wrangler; shell:true lets Windows find it.
const srv = REMOTE ? null : spawn('pnpm', ['exec', 'wrangler', 'dev', '--port', String(PORT)], {
  shell: true,
  stdio: 'inherit',
});

try {
  if (!REMOTE) await waitHealthy();
  await run();
  console.log('\n✓ all signaling tests passed');
  process.exitCode = 0;
} catch (err) {
  console.error('\n✗ test failed:', err.message);
  process.exitCode = 1;
} finally {
  srv?.kill();
  // wrangler spawns a workerd child; give kill a moment, then force-exit so the
  // test process doesn't hang on a lingering handle.
  setTimeout(() => process.exit(process.exitCode ?? 0), 1500);
}
