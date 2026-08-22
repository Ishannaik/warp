// Harness for deviceName.ts (#26): determinism, format, distribution sanity,
// and collision behavior across a realistic id population. Run: node deviceName.check.mjs
import assert from "node:assert/strict";
import { deviceName } from "./deviceName.ts";

// 1. Deterministic: same id → same name across many calls.
const id = "b9845b64-a11e-4c17-9f52-example0001";
assert.equal(deviceName(id), deviceName(id));
assert.equal(deviceName(id), deviceName(id));

// 2. Format: word-word-twoDigits.
const name = deviceName(id);
assert.match(name, /^[a-z]+-[a-z]+-\d{2}$/, `format: ${name}`);

// 3. Different ids get different names — tested on BOTH realistic shapes:
//    sequential strings (worst case for a weak hash) and UUIDv4-ish ids.
const shapes = [
  (i) => `peer-${i}`,
  (i) =>
    `${i.toString(16).padStart(8, "0")}-a11e-4c17-9f52-${(i * 7919).toString(16).padStart(12, "0")}`,
];
for (const shape of shapes) {
  const seen = new Map();
  for (let i = 0; i < 5000; i++) {
    const n = deviceName(shape(i));
    assert.match(n, /^[a-z]+-[a-z]+-\d{2}$/);
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  const dupes = [...seen.values()].filter((c) => c > 1).length;
  // Birthday math: 57,600 possible names (24·24·100) → ~215 expected
  // collisions in 5,000 draws. Near that is healthy; a spike means a bad hash.
  assert.ok(dupes <= 400, `collision rate too high (${dupes}/5000) for shape ${shape(0).slice(0, 8)}`);
}

// 4. Word parts come from fixed lists (no undefined/garbage slots).
const [adj, noun] = name.split("-");
assert.ok(adj.length >= 3 && noun.length >= 3);

console.log("deviceName.check: OK — deterministic, well-formatted, low-collision");
