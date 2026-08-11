const fs = require('fs');
let code = fs.readFileSync('web/src/lib/warp/sha256.ts', 'utf8');

code = code.replace(/data\[o\]/g, '(data[o] ?? 0)');
code = code.replace(/data\[o \+ 1\]/g, '(data[o + 1] ?? 0)');
code = code.replace(/data\[o \+ 2\]/g, '(data[o + 2] ?? 0)');
code = code.replace(/data\[o \+ 3\]/g, '(data[o + 3] ?? 0)');

code = code.replace(/w\[i - 15\]/g, '(w[i - 15] ?? 0)');
code = code.replace(/w\[i - 2\]/g, '(w[i - 2] ?? 0)');
code = code.replace(/w\[i - 16\]/g, '(w[i - 16] ?? 0)');
code = code.replace(/w\[i - 7\]/g, '(w[i - 7] ?? 0)');
code = code.replace(/K\[i\]/g, '(K[i] ?? 0)');
code = code.replace(/\+ w\[i\]\)/g, '+ (w[i] ?? 0))');

code = code.replace(/let a = h\[0\], b = h\[1\], c = h\[2\], d = h\[3\], e = h\[4\], f = h\[5\], g = h\[6\], hh = h\[7\];/,
  'let a = h[0] ?? 0, b = h[1] ?? 0, c = h[2] ?? 0, d = h[3] ?? 0, e = h[4] ?? 0, f = h[5] ?? 0, g = h[6] ?? 0, hh = h[7] ?? 0;');

code = code.replace(/h\[0\] \+= a/g, 'h[0] = (h[0] ?? 0) + a');
code = code.replace(/h\[1\] \+= b/g, 'h[1] = (h[1] ?? 0) + b');
code = code.replace(/h\[2\] \+= c/g, 'h[2] = (h[2] ?? 0) + c');
code = code.replace(/h\[3\] \+= d/g, 'h[3] = (h[3] ?? 0) + d');
code = code.replace(/h\[4\] \+= e/g, 'h[4] = (h[4] ?? 0) + e');
code = code.replace(/h\[5\] \+= f/g, 'h[5] = (h[5] ?? 0) + f');
code = code.replace(/h\[6\] \+= g/g, 'h[6] = (h[6] ?? 0) + g');
code = code.replace(/h\[7\] \+= hh/g, 'h[7] = (h[7] ?? 0) + hh');

code = code.replace(/s\.h\[i\]/g, '(s.h[i] ?? 0)');

code = code.replace(/if \(i < 64\) \{/g, 'if (i < 64) {\n      if (b === undefined) return;'); // hack for TS18048 'b' is possibly undefined

fs.writeFileSync('web/src/lib/warp/sha256.ts', code);
