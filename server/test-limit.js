import assert from 'node:assert/strict';

async function testLimits() {
  const sockets = [];
  const start = Date.now();
  for (let i = 0; i < 1050; i++) {
    const ws = new WebSocket('ws://localhost:18787');
    sockets.push(ws);
    await new Promise(r => {
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join' }));
        r();
      };
      ws.onerror = r;
    });
  }
  console.log('Connected 1050 in', Date.now() - start, 'ms');
  for (const w of sockets) w.close();
}
testLimits();
