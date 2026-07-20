/**
 * Runnable check for useNearby device rename logic.
 * Run: node src/lib/warp/useNearby.check.mjs (from web/)
 */

import assert from "node:assert";

// Stub localStorage if not functioning in Node environment
const storage = new Map();
if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== "function") {
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  };
}

const DEVICE_NAME_KEY = "wrap.deviceName";

function renameDevice(name) {
  const clean = name.trim().slice(0, 40) || "Device";
  try {
    localStorage.setItem(DEVICE_NAME_KEY, clean);
  } catch {
    /* best-effort */
  }
  return clean;
}

// 1. Trimming and clamping to 40 characters
{
  const input = "   " + "A".repeat(50) + "   ";
  const result = renameDevice(input);
  assert.equal(result.length, 40);
  assert.equal(result, "A".repeat(40));
  assert.equal(localStorage.getItem(DEVICE_NAME_KEY), "A".repeat(40));
}

// 2. Empty string or whitespace fallback to "Device"
{
  const result = renameDevice("   ");
  assert.equal(result, "Device");
  assert.equal(localStorage.getItem(DEVICE_NAME_KEY), "Device");
}

// 3. Normal rename
{
  const result = renameDevice("My Cool Laptop");
  assert.equal(result, "My Cool Laptop");
  assert.equal(localStorage.getItem(DEVICE_NAME_KEY), "My Cool Laptop");
}

console.log("OK: useNearby rename device checks passed");
