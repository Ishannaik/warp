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

  // 7. Reclaim window (H6=A): when BOTH devices drop at once (a shared tunnel), the
  //    code is reserved ~3 min so a rejoin resurrects the SAME room instead of a
  //    room-not-found — the piece that lets a dual-drop resume.
  const r1 = await connect();
  sendj(r1, { type: 'join' });
  const reclaimCode = (await next(r1, (m) => m.type === 'joined')).room;
  const r2 = await connect();
  sendj(r2, { type: 'join', room: reclaimCode });
  await next(r2, (m) => m.type === 'joined');
  r1.close(); // one leaves — room still has r2, so NOT reserved yet
  r2.close(); // last one out — now the code is reserved
  await delay(500); // let the close handlers persist the reclaim record
  const r3 = await connect();
  sendj(r3, { type: 'join', room: reclaimCode });
  const r3j = await next(r3, (m) => m.type === 'joined');
  assert.equal(r3j.room, reclaimCode, 'a both-sides drop can rejoin the SAME code within the reclaim window');
  assert.deepEqual(r3j.peers, [], 'reclaimed room starts empty — a fresh handshake, no stale server state');
  r3.close();

  // 8. Oversized-frame guard (#98): a frame over the cap gets a `message-too-large`
  //    error and is NOT relayed, while the same socket's normal-sized signals still
  //    flow — the guard rejects the frame, it doesn't kill the connection.
  const e = await connect();
  sendj(e, { type: 'join' });
  const eJoined = await next(e, (m) => m.type === 'joined');
  const f = await connect();
  sendj(f, { type: 'join', room: eJoined.room });
  const fJoined = await next(f, (m) => m.type === 'joined');
  await next(e, (m) => m.type === 'peer-joined');
  // Well over the 64 KiB cap (real SDP/ICE is a few KB).
  const oversized = { type: 'signal', to: fJoined.selfId, data: { pad: 'x'.repeat(128 * 1024) } };
  e.send(JSON.stringify(oversized));
  assert.equal((await next(e, (m) => m.type === 'error')).error, 'message-too-large', 'oversized frame is rejected');
  await delay(300);
  assert.equal(f.queue.filter((m) => m.type === 'signal').length, 0, 'oversized frame is not relayed');
  // The socket is still live: a normal signal right after still relays intact.
  sendj(e, { type: 'signal', to: fJoined.selfId, data: { sdp: 'still-here' } });
  const after = await next(f, (m) => m.type === 'signal');
  assert.deepEqual(after.data, { sdp: 'still-here' }, 'normal signals still relay after a rejected oversized one');
  e.close();
  f.close();

  // 9. Malformed `signal` frames are refused instead of silently dropped or half-relayed.
  //    A non-string `to` used to fail the peer lookup and disappear with no reply; a
  //    missing `data` still reached the peer as `data: undefined`.
  const s1 = await connect();
  sendj(s1, { type: 'join' });
  const s1j = await next(s1, (m) => m.type === 'joined');
  const s2 = await connect();
  sendj(s2, { type: 'join', room: s1j.room });
  const s2j = await next(s2, (m) => m.type === 'joined');
  await next(s1, (m) => m.type === 'peer-joined');

  for (const bad of [
    { type: 'signal', to: 42, data: { sdp: 'x' } },
    { type: 'signal', to: null, data: { sdp: 'x' } },
    { type: 'signal', to: { id: s1j.selfId }, data: { sdp: 'x' } },
    { type: 'signal', to: [s1j.selfId], data: { sdp: 'x' } },
    { type: 'signal', data: { sdp: 'x' } },              // no `to` at all
    { type: 'signal', to: s1j.selfId },                  // no `data` at all
  ]) {
    sendj(s2, bad);
    const err = await next(s2, (m) => m.type === 'error');
    assert.equal(err.error, 'bad-message', `rejects ${JSON.stringify(bad)}`);
  }
  await delay(300);
  assert.equal(s1.queue.filter((m) => m.type === 'signal').length, 0, 'no malformed frame reached the peer');

  // The guard must not have broken the relay path it sits in front of.
  sendj(s2, { type: 'signal', to: s1j.selfId, data: { sdp: 'ok' } });
  const good = await next(s1, (m) => m.type === 'signal');
  assert.equal(good.from, s2j.selfId, 'a valid frame still relays with a server-stamped from');
  assert.deepEqual(good.data, { sdp: 'ok' }, 'valid payload relayed intact');

  // `data: null` is a present value, not an absence. The guard checks for the key, not
  // its contents, so null relays — that is what keeping `data` opaque means.
  sendj(s2, { type: 'signal', to: s1j.selfId, data: null });
  const nulled = await next(s1, (m) => m.type === 'signal');
  assert.equal(nulled.data, null, 'null data relays — the guard never inspects the payload');

  // 10. One-time rooms (#136): if a room is created with oneTime: true and later retired,
  //     new joins get code-expired, but existing peers can keep communicating.
  const o1 = await connect();
  sendj(o1, { type: 'join', oneTime: true });
  const o1j = await next(o1, (m) => m.type === 'joined');

  const o2 = await connect();
  sendj(o2, { type: 'join', room: o1j.room });
  const o2j = await next(o2, (m) => m.type === 'joined');

  // Retire the room
  sendj(o1, { type: 'retire' });
  await delay(300);

  // Third peer tries to join
  const o3 = await connect();
  sendj(o3, { type: 'join', room: o1j.room });
  const errO3 = await next(o3, (m) => m.type === 'error');
  assert.equal(errO3.error, 'code-expired', 'new joiner gets code-expired after room is retired');

  // Existing peers can still signal
  sendj(o2, { type: 'signal', to: o1j.selfId, data: { sdp: 'after-retire' } });
  const sigAfter = await next(o1, (m) => m.type === 'signal');
  assert.deepEqual(sigAfter.data, { sdp: 'after-retire' }, 'existing peers can still signal after retirement');

  for (const ws of [a, c, d, s1, s2, o1, o2, o3]) ws.close();
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
