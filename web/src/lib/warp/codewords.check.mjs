// Harness for shared/codewords.js (#42): the code⇄alias mapping must be a
// bijection over the whole 31^6 space — every valid code round-trips, no
// alias decodes to a different code, and malformed input is rejected.
// Run: node codewords.check.mjs   (from web/src/lib/warp/, via run-checks)
import assert from 'node:assert/strict';

// web/src/lib/warp/ → repo root is 4 levels up.
const { codeToAlias, aliasToCode, looksLikeAlias, CODE_SPACE } = await import(
  new URL('../../../../shared/codewords.js', import.meta.url).href
);

const CODE_RE = /^[A-HJ-KM-NP-Z2-9]{6}$/;

// 1. Exhaustive-style sweep: sample the space densely AND hit the corners.
const samples = [...new Set([
  ...Array.from({ length: 2000 }, (_, v) => v),
  ...Array.from({ length: 5000 }, () => Math.floor(Math.random() * CODE_SPACE)),
  0, 1, CODE_SPACE - 1, // corners
])];

const seenAliases = new Map();
for (const v of samples) {
  // value → code via the same base-31 math, independent of the module under test
  let x = BigInt(v), code = '';
  for (let i = 0; i < 6; i++) { code = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Number(x % 31n)] + code; x /= 31n; }
  assert.match(code, CODE_RE);

  const alias = codeToAlias(code);
  assert.ok(alias, `alias generation failed for ${code}`);
  assert.match(alias, /^[a-z]+(-[a-z]+){4}$/, `bad alias shape for ${code}: ${alias}`);

  const back = aliasToCode(alias);
  assert.equal(back, code, `round-trip broke: ${code} -> ${alias} -> ${back}`);

  seenAliases.set(alias, (seenAliases.get(alias) ?? 0) + 1);
}
for (const [alias, count] of seenAliases) assert.equal(count, 1, `alias collision on ${alias}`);

// 2. Malformed inputs are rejected, not thrown.
assert.equal(codeToAlias('0O1IIL'), null);      // not in alphabet
assert.equal(codeToAlias('SHORT'), null);
assert.equal(codeToAlias(null), null);
assert.equal(aliasToCode('otter-maple'), null);          // wrong word count
assert.equal(aliasToCode('foo-bar-baz-qux-quux'), null); // unknown words
assert.equal(aliasToCode(''), null);
assert.equal(aliasToCode(null), null);

// 3. Case/separator tolerance.
const k7 = codeToAlias('K7P2QR');
assert.equal(aliasToCode(k7.toUpperCase()), 'K7P2QR');
assert.equal(aliasToCode(k7.replaceAll('-', ' ')), 'K7P2QR');

// 4. looksLikeAlias classifies correctly.
assert.equal(looksLikeAlias('K7P2QR'), false);
assert.equal(looksLikeAlias('acorn-acorn-acorn-acorn-acorn'), true);
assert.equal(looksLikeAlias('shorty'), true);            // has lowercase letters, not a code shape
assert.equal(looksLikeAlias(null), false);

console.log('codewords.check: OK —', samples.length + 3, 'codes round-trip injectively');
