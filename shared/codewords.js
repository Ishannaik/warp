// codewords.js — deterministic room-code ⇄ spoken-word alias (#42).
//
// ONE shared module for server and web, so the generator and the resolver can
// never drift. Plain JS (no types), ESM, zero deps — the server imports it as
// a Worker module, the web app imports it straight from source.
//
// The mapping is a bijection over the whole code space: 31^6 = 887,503,681
// codes ↔ 100^5 = 10,000,000,000 five-word aliases. Five slots is not a
// stylistic choice — with 3 words (10^6) most codes would collide. Aliases are
// `word-word-word-word-word`, e.g. "otter-maple-fox-ember-linx".
//
// The SERVER still owns codes: it mints the canonical code and resolves an
// alias back to it on join. Clients only render/parse; nothing here lets a
// client invent a room.

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 6;
export const CODE_SPACE = Math.pow(CODE_ALPHABET.length, CODE_LEN); // 887,503,681

// 100 safe common words: no profanity/slurs, no lookalike pairs inside one
// slot's usage (they're positional, so cross-slot repeats are harmless), all
// 3-5 letters, speakable, distinct first letters where possible.
const WORDS = [
  'acorn', 'amber', 'anchor', 'apple', 'arrow', 'aspen', 'atlas', 'aurora',
  'badge', 'bamboo', 'basil', 'beacon', 'birch', 'bison', 'breeze', 'brook',
  'cactus', 'canyon', 'cedar', 'chalk', 'cherry', 'cinder', 'citrus', 'clover',
  'comet', 'coral', 'cosmos', 'crane', 'daisy', 'delta', 'denim', 'dune',
  'eagle', 'ember', 'fable', 'falcon', 'fern', 'flint', 'forest', 'fossil',
  'gecko', 'ginger', 'granite', 'grove', 'harbor', 'hazel', 'helix', 'heron',
  'indigo', 'ivory', 'jade', 'jasmine', 'juniper', 'kelp', 'kernel', 'lagoon',
  'lantern', 'larch', 'lichen', 'lotus', 'lynx', 'mango', 'maple', 'marble',
  'meadow', 'mesa', 'mint', 'moss', 'nebula', 'nectar', 'nimbus', 'north', 'nova',
  'oak', 'onyx', 'opal', 'orbit', 'otter', 'paddle', 'pebble', 'pine',
  'plume', 'prairie', 'quartz', 'quill', 'radish', 'raven', 'reef', 'ridge',
  'river', 'rocket', 'sage', 'sand', 'sparrow', 'spruce', 'summit', 'talon',
  'thistle', 'timber', 'topaz', 'tulip', 'valley', 'velvet', 'willow', 'zephyr',
].slice(0, 100);

if (WORDS.length !== 100) throw new Error(`codewords: need exactly 100 words, have ${WORDS.length}`);
if (new Set(WORDS).size !== WORDS.length) throw new Error('codewords: duplicate word in list');

/** Code string → bigint value (base-31, big-endian). */
function codeToValue(code) {
  let v = 0n;
  for (let i = 0; i < CODE_LEN; i++) {
    v = v * BigInt(CODE_ALPHABET.length) + BigInt(CODE_ALPHABET.indexOf(code[i]));
  }
  return v;
}

/** Bigint value → code string (inverse of codeToValue). */
function valueToCode(v) {
  const base = BigInt(CODE_ALPHABET.length);
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out = CODE_ALPHABET[Number(v % base)] + out;
    v /= base;
  }
  return out;
}

/**
 * Canonical 6-char code → its spoken alias ("otter-maple-fox-ember-linx").
 * Pure integer decomposition: alias = 5 base-100 digits of the code's value.
 * Injective by construction.
 */
export function codeToAlias(code) {
  if (!new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`).test(code)) return null;
  let v = codeToValue(code);
  const base = 100n;
  const parts = [];
  for (let i = 0; i < 5; i++) {
    parts.unshift(WORDS[Number(v % base)]);
    v /= base;
  }
  return parts.join('-');
}

/**
 * Spoken alias → canonical code, or null if malformed/unknown word.
 * Accepts any dash/space separation and case ("Otter Maple Fox Ember Linx").
 */
export function aliasToCode(alias) {
  if (typeof alias !== 'string') return null;
  const words = alias.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (words.length !== 5 || !words.every((w) => WORDS.includes(w))) return null;
  let v = 0n;
  for (const w of words) v = v * 100n + BigInt(WORDS.indexOf(w));
  // Value must fall inside the real code space, or it decodes to garbage.
  if (v >= BigInt(CODE_SPACE)) return null;
  return valueToCode(v);
}

/** True if the string looks like a word alias rather than a raw code. */
export function looksLikeAlias(input) {
  return typeof input === 'string' && /[a-z]/i.test(input) && !new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`).test(input);
}
