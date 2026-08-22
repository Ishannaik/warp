// deviceName.ts — friendly, stable, offline device labels (#26).
//
// A peer id like "b9845b64-…" is unreadable in a room with two devices.
// Instead we derive a deterministic label from the id's own bits: an adjective
// + a noun + a 2-digit tail ("amber-otter-42"). Same id → same name, on both
// peers, forever, with zero state and zero protocol change. The tail keeps
// collisions readable even if two devices ever land on the same pair of words.

const ADJECTIVES = [
  "amber", "brisk", "calm", "clever", "dusk", "eager", "fond", "gentle",
  "hazel", "ivory", "jolly", "keen", "lively", "mellow", "noble", "olive",
  "plucky", "quiet", "rapid", "sturdy", "tidy", "urban", "vivid", "witty",
];

const NOUNS = [
  "otter", "maple", "comet", "heron", "cedar", "falcon", "willow", "harbor",
  "lynx", "quartz", "ember", "juniper", "badger", "lagoon", "sparrow", "basalt",
  "cricket", "dahlia", "ferret", "garnet", "ibex", "kelpie", "martin", "nova",
];

/** Deterministic FNV-1a with a murmur-style finalizer — tiny, dependency-free.
 *  The final mix is load-bearing: plain FNV's low bits mirror low input bits,
 *  which skews any h % small-slot derivation (sequential ids collided ~3x the
 *  birthday rate before this). */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * Stable friendly name for a peer/device id. Pure function: the same id
 * produces the same label everywhere (both peers see one shared name).
 * Two independent FNV slices keep the word slots and the numeric tail from
 * correlating (a shared modulus would skew collisions).
 */
export function deviceName(peerId: string): string {
  const h = fnv1a(peerId);
  const t = fnv1a(`tail:${peerId}`);
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(h / ADJECTIVES.length) % NOUNS.length];
  const tail = String(t % 100).padStart(2, "0");
  return `${adj}-${noun}-${tail}`;
}
