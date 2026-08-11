const fs = require('fs');
const cp = require('child_process');

try {
  cp.execSync('git checkout -b issue-101-sharding-2', {stdio: 'inherit'});
} catch (e) {
  cp.execSync('git checkout issue-101-sharding-2', {stdio: 'inherit'});
}

let indexJs = fs.readFileSync('server/src/index.js', 'utf8');
indexJs = indexJs.replace(
  /const id = env\.SIGNALING\.idFromName\('global'\);\n    return env\.SIGNALING\.get\(id\)\.fetch\(request\);/,
  `let ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (ip.includes(':')) ip = ip.split(':').slice(0, 4).join(':');
    let id;
    if (url.searchParams.has('nearby')) {
      id = env.SIGNALING.idFromName('nearby-' + ip);
    } else {
      let room = url.searchParams.get('room');
      if (!room) {
        const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        const bytes = crypto.getRandomValues(new Uint8Array(6));
        room = '';
        for (let i = 0; i < 6; i++) room += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      }
      id = env.SIGNALING.idFromName('room-' + room);
      url.searchParams.set('room', room);
    }
    const doReq = new Request(url, request);
    return env.SIGNALING.get(id).fetch(doReq);`);

indexJs = indexJs.replace(
  /server\.serializeAttachment\(\{ ip \}\);/,
  `let intent = url.searchParams.has('nearby') ? 'nearby' : 'room';
    let urlRoom = url.searchParams.get('room');
    server.serializeAttachment({ ip, intent, urlRoom });`);

indexJs = indexJs.replace(
  /  makeCode\(\) \{[\s\S]*?    return code;\n  \}/,
  `  // makeCode removed as the Worker now handles code generation`);

indexJs = indexJs.replace(
  /if \(prev && prev\.room != null\) this\.notifyLeft\(ws, prev\);/,
  `if (prev && prev.room != null && prev.intent !== 'nearby') this.notifyLeft(ws, prev);`);

indexJs = indexJs.replace(
  /code = this\.makeCode\(\);                             \/\/ no code given => create a room/,
  `code = prev.urlRoom;                             // code was assigned by the Worker`);
fs.writeFileSync('server/src/index.js', indexJs);

let testJs = fs.readFileSync('server/test.js', 'utf8');
testJs = testJs.replace(/function connect\(\) \{/g, 'function connect(url = WS + "?create=1") {');
testJs = testJs.replace(/const ws = new WebSocket\(WS\);/g, 'const ws = new WebSocket(url);');
testJs = testJs.replace(/const b = await connect\(\);/g, 'const b = await connect(WS + "?room=" + aJoined.room);');
testJs = testJs.replace(/const d = await connect\(\);/g, 'const d = await connect(WS + "?room=abc");');
testJs = testJs.replace(/const r2 = await connect\(\);/g, 'const r2 = await connect(WS + "?room=" + reclaimCode);');
testJs = testJs.replace(/const r3 = await connect\(\);/g, 'const r3 = await connect(WS + "?room=" + reclaimCode);');
testJs = testJs.replace(/const f = await connect\(\);/g, 'const f = await connect(WS + "?room=" + eJoined.room);');
testJs = testJs.replace(/const s2 = await connect\(\);/g, 'const s2 = await connect(WS + "?room=" + s1j.room);');
fs.writeFileSync('server/test.js', testJs);

let sigTs = fs.readFileSync('web/src/lib/warp/signaling.ts', 'utf8');
sigTs = sigTs.replace(/private joinRoom: string \| undefined;/g, 'private joinRoom: string | undefined;\n  private joinIntent: string | undefined;');
sigTs = sigTs.replace(/connect\(room\?: string\): void \{/g, 'connect(room?: string, intent?: "room" | "nearby"): void {');
sigTs = sigTs.replace(/this\.joinRoom = room;/g, 'this.joinRoom = room;\n    this.joinIntent = intent;');
sigTs = sigTs.replace(/const ws = new WebSocket\(SIGNALING_URL\);/g, `let url = SIGNALING_URL;
    const room = this.room ?? this.joinRoom;
    if (this.joinIntent === "nearby") {
      url += "?nearby=1";
    } else if (room) {
      url += \`?room=\${room}\`;
    } else {
      url += "?create=1";
    }
    const ws = new WebSocket(url);`);
sigTs = sigTs.replace(/const room = this\.room \?\? this\.joinRoom;\n/g, '');
fs.writeFileSync('web/src/lib/warp/signaling.ts', sigTs);

let nearTs = fs.readFileSync('web/src/lib/warp/useNearby.ts', 'utf8');
nearTs = nearTs.replace(/sig\.connect\(\); \/\/ Reconnects silently/g, 'sig.connect(undefined, "nearby"); // Reconnects silently');
nearTs = nearTs.replace(/sig\.connect\(\);\n\n    return/g, 'sig.connect(undefined, "nearby");\n\n    return');
fs.writeFileSync('web/src/lib/warp/useNearby.ts', nearTs);

cp.execSync('git add . && git commit -m "feat: Shard signaling Durable Object by room (#101)"', {stdio: 'inherit'});
try {
  cp.execSync('git push -u origin HEAD', {stdio: 'inherit'});
  cp.execSync('gh pr create --title "feat: Shard signaling Durable Object by room" --body "Closes #101"', {stdio: 'inherit'});
} catch(e) {
  console.log("Could not push or create PR:", e.message);
}
