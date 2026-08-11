const fs = require('fs');

let transferStats = fs.readFileSync('web/src/lib/warp/transferStats.ts', 'utf8');
transferStats = transferStats.replace(
  'const newest = this.samples[n - 1];\n    if (now - newest.t > STALE_AFTER_MS) return 0; // stalled: honest zero',
  'const newest = this.samples[n - 1];\n    if (!oldest || !newest || now - newest.t > STALE_AFTER_MS) return 0; // stalled: honest zero'
);
transferStats = transferStats.replace(
  'while (i < this.samples.length - 1 && this.samples[i + 1].t <= cutoff) i++;',
  'while (i < this.samples.length - 1) {\n      const next = this.samples[i + 1];\n      if (next && next.t <= cutoff) i++;\n      else break;\n    }'
);
fs.writeFileSync('web/src/lib/warp/transferStats.ts', transferStats);

let transfer = fs.readFileSync('web/src/lib/warp/transfer.ts', 'utf8');
transfer = transfer.replace(
  'const group = groups.get(batchId)!;\n    if (group.length < 2) continue;\n    const bytesTotal = group.reduce((s, i) => s + i.size, 0);\n    const bytesDone = group.reduce((s, i) => s + i.transferred, 0);\n    summaries.push({\n      batchId,\n      direction: group[0].direction,\n      peerId: group[0].peerId,',
  'const group = groups.get(batchId)!;\n    const first = group[0];\n    if (group.length < 2 || !first) continue;\n    const bytesTotal = group.reduce((s, i) => s + i.size, 0);\n    const bytesDone = group.reduce((s, i) => s + i.transferred, 0);\n    summaries.push({\n      batchId,\n      direction: first.direction,\n      peerId: first.peerId,'
);
fs.writeFileSync('web/src/lib/warp/transfer.ts', transfer);

let useNearby = fs.readFileSync('web/src/nearby/useNearbyTransfer.ts', 'utf8');
useNearby = useNearby.replace(/failSession\(PEER_ERROR_COPY\["channel-error"\]\)/g, 'failSession(PEER_ERROR_COPY["channel-error"] ?? "Channel error")');
fs.writeFileSync('web/src/nearby/useNearbyTransfer.ts', useNearby);

let router = fs.readFileSync('web/src/router.tsx', 'utf8');
router = router.replace('return m ? decodeURIComponent(m[1]) : null;', 'return m && m[1] ? decodeURIComponent(m[1]) : null;');
fs.writeFileSync('web/src/router.tsx', router);

let useWarp = fs.readFileSync('web/src/lib/warp/useWarpTransfer.ts', 'utf8');
useWarp = useWarp.replace(/if \(i !== -1\) files\.push\(pool\.splice\(i, 1\)\[0\]\);/g, 'if (i !== -1) {\n          const f = pool.splice(i, 1)[0];\n          if (f) files.push(f);\n        }');
useWarp = useWarp.replace('const file = pool[i];\n    setItems', 'const file = pool[i];\n    if (!file) return;\n    setItems');
fs.writeFileSync('web/src/lib/warp/useWarpTransfer.ts', useWarp);

let peer = fs.readFileSync('web/src/lib/warp/peer.ts', 'utf8');
peer = peer.replace('const file = files[i];\n      const id = fileId();', 'const file = files[i];\n      if (!file) continue;\n      const id = fileId();');
fs.writeFileSync('web/src/lib/warp/peer.ts', peer);

let pieceManifest = fs.readFileSync('web/src/lib/warp/pieceManifest.ts', 'utf8');
pieceManifest = pieceManifest.replace('this.pending[0].byteLength', 'this.pending[0]?.byteLength');
pieceManifest = pieceManifest.replace('const head = this.pending[0];\n      const take = Math.min(head.byteLength', 'const head = this.pending[0];\n      if (!head) break;\n      const take = Math.min(head.byteLength');
fs.writeFileSync('web/src/lib/warp/pieceManifest.ts', pieceManifest);

let doObj = fs.readFileSync('web/src/theory/diagrams/DurableObject.tsx', 'utf8');
doObj = doObj.replace('SEQUENCE[i].ms', '(SEQUENCE[i]?.ms ?? 1000)');
doObj = doObj.replace('SEQUENCE[idx].stage', '(SEQUENCE[idx]?.stage ?? "brokering")');
fs.writeFileSync('web/src/theory/diagrams/DurableObject.tsx', doObj);

let handshake = fs.readFileSync('web/src/theory/diagrams/Handshake.tsx', 'utf8');
handshake = handshake.replace('const current = ORDER[i];\n      timer = setTimeout', 'const current = ORDER[i];\n      if (!current) return;\n      timer = setTimeout');
fs.writeFileSync('web/src/theory/diagrams/Handshake.tsx', handshake);

let l3 = fs.readFileSync('web/src/theory/diagrams/L3Transit.tsx', 'utf8');
l3 = l3.replace('const h = HOPS[hopIdx - 1];\n                  const a', 'const h = HOPS[hopIdx - 1];\n                  if (!h) return null;\n                  const a');
l3 = l3.replace('HOPS[totalCrossings - 1].to', '(HOPS[totalCrossings - 1]?.to ?? "")');
l3 = l3.replace('HOPS[totalCrossings - 1].to', '(HOPS[totalCrossings - 1]?.to ?? "")');
fs.writeFileSync('web/src/theory/diagrams/L3Transit.tsx', l3);

let stun = fs.readFileSync('web/src/theory/diagrams/NatStun.tsx', 'utf8');
stun = stun.replace('PORTS[0]', '(PORTS[0] ?? "")');
stun = stun.replace('PORTS[portIdx]', '(PORTS[portIdx] ?? "")');
fs.writeFileSync('web/src/theory/diagrams/NatStun.tsx', stun);

let theory = fs.readFileSync('web/src/theory/Theory.tsx', 'utf8');
theory = theory.replace('LAYERS[i].id', '(LAYERS[i]?.id ?? "")');
fs.writeFileSync('web/src/theory/Theory.tsx', theory);

let tf = fs.readFileSync('web/src/transfer/TransferFlow.tsx', 'utf8');
tf = tf.replace('others[0]', '(others[0] ?? "")');
fs.writeFileSync('web/src/transfer/TransferFlow.tsx', tf);

let viteConfig = fs.readFileSync('web/vite.config.ts', 'utf8');
viteConfig = viteConfig.replace('process.env.ANALYZE', 'process.env["ANALYZE"]');
fs.writeFileSync('web/vite.config.ts', viteConfig);

let app = fs.readFileSync('web/src/App.tsx', 'utf8');
app = app.replace('code={code}', 'code={code || ""}');
fs.writeFileSync('web/src/App.tsx', app);

let sha256 = fs.readFileSync('web/src/lib/warp/sha256.ts', 'utf8');
sha256 = sha256.replace(/data\[o\]/g, '(data[o] ?? 0)');
sha256 = sha256.replace(/data\[o \+ 1\]/g, '(data[o + 1] ?? 0)');
sha256 = sha256.replace(/data\[o \+ 2\]/g, '(data[o + 2] ?? 0)');
sha256 = sha256.replace(/data\[o \+ 3\]/g, '(data[o + 3] ?? 0)');

sha256 = sha256.replace(/w\[i - 15\]/g, '(w[i - 15] ?? 0)');
sha256 = sha256.replace(/w\[i - 2\]/g, '(w[i - 2] ?? 0)');
sha256 = sha256.replace(/w\[i - 16\]/g, '(w[i - 16] ?? 0)');
sha256 = sha256.replace(/w\[i - 7\]/g, '(w[i - 7] ?? 0)');
sha256 = sha256.replace(/K\[i\]/g, '(K[i] ?? 0)');
sha256 = sha256.replace(/\+ w\[i\]\)/g, '+ (w[i] ?? 0))');

sha256 = sha256.replace(/let a = h\[0\], b = h\[1\], c = h\[2\], d = h\[3\], e = h\[4\], f = h\[5\], g = h\[6\], hh = h\[7\];/,
  'let a = h[0] ?? 0, b = h[1] ?? 0, c = h[2] ?? 0, d = h[3] ?? 0, e = h[4] ?? 0, f = h[5] ?? 0, g = h[6] ?? 0, hh = h[7] ?? 0;');

sha256 = sha256.replace(/h\[0\] \+ a/g, '(h[0] ?? 0) + a');
sha256 = sha256.replace(/h\[1\] \+ b/g, '(h[1] ?? 0) + b');
sha256 = sha256.replace(/h\[2\] \+ c/g, '(h[2] ?? 0) + c');
sha256 = sha256.replace(/h\[3\] \+ d/g, '(h[3] ?? 0) + d');
sha256 = sha256.replace(/h\[4\] \+ e/g, '(h[4] ?? 0) + e');
sha256 = sha256.replace(/h\[5\] \+ f/g, '(h[5] ?? 0) + f');
sha256 = sha256.replace(/h\[6\] \+ g/g, '(h[6] ?? 0) + g');
sha256 = sha256.replace(/h\[7\] \+ hh/g, '(h[7] ?? 0) + hh');

sha256 = sha256.replace(/s\.h\[i\]/g, '(s.h[i] ?? 0)');
fs.writeFileSync('web/src/lib/warp/sha256.ts', sha256);
