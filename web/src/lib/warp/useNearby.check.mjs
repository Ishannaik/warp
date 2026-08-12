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

const DEVICE_NAME_KEY = "warp.deviceName";
const LEGACY_DEVICE_NAME_KEY = "wrap.deviceName";

function renameDevice(name) {
  const clean = name.trim().slice(0, 40) || "Device";
  try {
    localStorage.setItem(DEVICE_NAME_KEY, clean);
  } catch {
    /* best-effort */
  }
  return clean;
}

function loadDeviceName() {
  const existing = localStorage.getItem(DEVICE_NAME_KEY);
  if (existing && existing.trim()) return existing;

  const legacy = localStorage.getItem(LEGACY_DEVICE_NAME_KEY);
  if (legacy && legacy.trim()) {
    localStorage.setItem(DEVICE_NAME_KEY, legacy);
    localStorage.removeItem(LEGACY_DEVICE_NAME_KEY);
    return legacy;
  }
  return null;
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

// 4. Legacy "wrap.deviceName" value migrates to "warp.deviceName" once
{
  storage.clear();
  localStorage.setItem(LEGACY_DEVICE_NAME_KEY, "Old Wrap Name");
  const result = loadDeviceName();
  assert.equal(result, "Old Wrap Name");
  assert.equal(localStorage.getItem(DEVICE_NAME_KEY), "Old Wrap Name");
  assert.equal(localStorage.getItem(LEGACY_DEVICE_NAME_KEY), null);
}

// 5. No stored name at all -> loadDeviceName has nothing to fall back to
{
  storage.clear();
  assert.equal(loadDeviceName(), null);
}

// --- #138 device-type guess (mirrors guessDeviceType in useNearby.ts) -------

function guessDeviceType(ua, uaData, maxTouchPoints) {
  try {
    if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return "tablet";
    if (/Tablet|PlayBook|Kindle|Silk/i.test(ua)) return "tablet";
    if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return "tablet";

    if (uaData && typeof uaData.mobile === "boolean") {
      return uaData.mobile ? "mobile" : "desktop";
    }
    if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return "mobile";

    return "desktop";
  } catch {
    return "desktop";
  }
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const ANDROID_PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36";
const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";
const IPADOS13_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";
const ANDROID_TABLET_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Safari/537.36"; // no "Mobile" token
const WINDOWS_DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
const MAC_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";

// 6. iPhone UA -> mobile
assert.equal(guessDeviceType(IPHONE_UA, undefined, 0), "mobile");

// 7. Android phone UA (has "Mobile" token) -> mobile
assert.equal(guessDeviceType(ANDROID_PHONE_UA, undefined, 0), "mobile");

// 8. iPad (modern UA, reports "iPad") -> tablet
assert.equal(guessDeviceType(IPAD_UA, undefined, 5), "tablet");

// 9. iPadOS 13+ reporting a bare Macintosh UA, but touch-capable -> tablet
assert.equal(guessDeviceType(IPADOS13_UA, undefined, 5), "tablet");

// 10. Same Macintosh UA with no touch points -> a real Mac, desktop
assert.equal(guessDeviceType(MAC_DESKTOP_UA, undefined, 0), "desktop");

// 11. Android tablet UA without the "Mobile" token -> tablet
assert.equal(guessDeviceType(ANDROID_TABLET_UA, undefined, 0), "tablet");

// 12. Plain Windows desktop UA -> desktop
assert.equal(guessDeviceType(WINDOWS_DESKTOP_UA, undefined, 0), "desktop");

// 13. userAgentData.mobile, when present, wins over UA string sniffing
assert.equal(guessDeviceType(WINDOWS_DESKTOP_UA, { mobile: true }, 0), "mobile");
assert.equal(guessDeviceType(ANDROID_PHONE_UA, { mobile: false }, 0), "desktop");

// 14. Empty/unrecognized UA never throws and falls back to the generic desktop icon
assert.equal(guessDeviceType("", undefined, 0), "desktop");
assert.equal(guessDeviceType("SomeWeirdBot/1.0", undefined, undefined), "desktop");

console.log("OK: useNearby rename + device-type guess checks passed");
