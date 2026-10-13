/**
 * This device's identity for LAN discovery: its persisted display name and a
 * coarse device-type guess for the nearby list's icon.
 *
 * Extracted from useNearby (no React import) so `useNearby.check.mjs` exercises
 * the real functions rather than a hand-mirrored copy that can't catch a
 * regression in the code it mirrors (#341).
 */

export const DEVICE_NAME_KEY = "warp.deviceName";
/** Pre-rename key; still read once so an existing name survives the migration. */
export const LEGACY_DEVICE_NAME_KEY = "wrap.deviceName";

/** Coarse device shape, guessed client-side for the nearby list's icon. */
export type DeviceType = "mobile" | "tablet" | "desktop";

/** The `navigator.userAgentData` surface Chromium exposes (unstandardized, optional). */
export interface UserAgentDataLike {
  mobile?: boolean;
}

/**
 * Best-effort phone/tablet/desktop guess from the UA — never throws, never blocks.
 * iPadOS 13+ reports a Mac UA, so a touch-capable "Macintosh" is treated as a tablet
 * before the mobile checks run. Anything that doesn't clearly read as a handheld
 * falls back to "desktop", which is also the generic/unrecognized-UA icon.
 *
 * Pure over its inputs; the hook passes `navigator`'s values in.
 */
export function guessDeviceType(
  ua: string,
  uaData: UserAgentDataLike | undefined,
  maxTouchPoints: number,
): DeviceType {
  try {
    if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) {
      return "tablet";
    }
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

const ADJECTIVES = [
  "Amber", "Brisk", "Cobalt", "Dusky", "Ember", "Fleet", "Gilded", "Hazel",
  "Ivory", "Jade", "Keen", "Lunar", "Mossy", "Noble", "Onyx", "Plum",
  "Quartz", "Rusty", "Slate", "Teal", "Umber", "Velvet", "Warm", "Zephyr",
];
const NOUNS = [
  "Otter", "Falcon", "Maple", "Comet", "Heron", "Lynx", "Pylon", "Quokka",
  "Raven", "Tapir", "Willow", "Badger", "Cedar", "Drake", "Finch", "Glade",
];

/** Pick a stable, friendly "Adjective Noun" — falls back to Device-XXXX. */
function generateDeviceName(): string {
  try {
    const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${a} ${n}`;
  } catch {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `Device-${suffix}`;
  }
}

/** Read the persisted device name, minting + saving one on first run. */
export function loadDeviceName(): string {
  try {
    const existing = localStorage.getItem(DEVICE_NAME_KEY);
    if (existing && existing.trim()) return existing;

    const legacy = localStorage.getItem(LEGACY_DEVICE_NAME_KEY);
    if (legacy && legacy.trim()) {
      localStorage.setItem(DEVICE_NAME_KEY, legacy);
      try {
        localStorage.removeItem(LEGACY_DEVICE_NAME_KEY);
      } catch {
        /* best-effort cleanup */
      }
      return legacy;
    }
  } catch {
    /* storage unavailable (private mode / SSR) — fall through to a fresh name */
  }
  const fresh = generateDeviceName();
  try {
    localStorage.setItem(DEVICE_NAME_KEY, fresh);
  } catch {
    /* best-effort persistence */
  }
  return fresh;
}

/** Clean a user-chosen name (trim, clamp to 40, never empty), persist it, and
 *  return what was stored. */
export function renameDevice(name: string): string {
  const clean = name.trim().slice(0, 40) || "Device";
  try {
    localStorage.setItem(DEVICE_NAME_KEY, clean);
  } catch {
    /* best-effort */
  }
  return clean;
}
