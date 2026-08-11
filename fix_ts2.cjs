const fs = require('fs');

let useTransferSim = fs.readFileSync('web/src/hero/useTransferSim.ts', 'utf8');
useTransferSim = useTransferSim.replace(
  'if (rows.every((r) => r.status === "done")) {\n    rows[0].pct = 6;',
  'if (rows.every((r) => r.status === "done")) {\n    if (rows[0]) rows[0].pct = 6;\n    if (rows[0]) rows[0].status = "up";\n    if (rows[1]) rows[1].pct = 0;\n    if (rows[1]) rows[1].status = "up";\n    if (rows[4]) rows[4].pct = 0;\n    if (rows[4]) rows[4].status = "queued";\n  }'
);
useTransferSim = useTransferSim.replace(
  'rows[0].status = "up";\n    rows[1].pct = 0;\n    rows[1].status = "up";\n    rows[4].pct = 0;\n    rows[4].status = "queued";',
  ''
);
fs.writeFileSync('web/src/hero/useTransferSim.ts', useTransferSim);

let peer = fs.readFileSync('web/src/lib/warp/peer.ts', 'utf8');
peer = peer.replace(
  'const id = ids[i];\n        const file = files[i];',
  'const id = ids[i];\n        const file = files[i];\n        if (!id || !file) continue;'
);
fs.writeFileSync('web/src/lib/warp/peer.ts', peer);

let sha256 = fs.readFileSync('web/src/lib/warp/sha256.ts', 'utf8');
sha256 = sha256.replace(/h\[0\]/g, '(h[0] ?? 0)');
sha256 = sha256.replace(/h\[1\]/g, '(h[1] ?? 0)');
sha256 = sha256.replace(/h\[2\]/g, '(h[2] ?? 0)');
sha256 = sha256.replace(/h\[3\]/g, '(h[3] ?? 0)');
sha256 = sha256.replace(/h\[4\]/g, '(h[4] ?? 0)');
sha256 = sha256.replace(/h\[5\]/g, '(h[5] ?? 0)');
sha256 = sha256.replace(/h\[6\]/g, '(h[6] ?? 0)');
sha256 = sha256.replace(/h\[7\]/g, '(h[7] ?? 0)');
sha256 = sha256.replace(/\(b & c\)/g, '((b ?? 0) & (c ?? 0))');
sha256 = sha256.replace(/\(b & d\)/g, '((b ?? 0) & (d ?? 0))');
sha256 = sha256.replace(/\(c & d\)/g, '((c ?? 0) & (d ?? 0))');
sha256 = sha256.replace(/\(b >>> 2\)/g, '((b ?? 0) >>> 2)');
sha256 = sha256.replace(/\(b >>> 13\)/g, '((b ?? 0) >>> 13)');
sha256 = sha256.replace(/\(b << 30\)/g, '((b ?? 0) << 30)');
sha256 = sha256.replace(/\(b << 19\)/g, '((b ?? 0) << 19)');
sha256 = sha256.replace(/\(b >>> 22\)/g, '((b ?? 0) >>> 22)');
sha256 = sha256.replace(/\(b << 10\)/g, '((b ?? 0) << 10)');
fs.writeFileSync('web/src/lib/warp/sha256.ts', sha256);

let hs = fs.readFileSync('web/src/theory/diagrams/Handshake.tsx', 'utf8');
hs = hs.replace('setPhase(ORDER[i]);', 'setPhase(ORDER[i] ?? "dormant");');
fs.writeFileSync('web/src/theory/diagrams/Handshake.tsx', hs);
