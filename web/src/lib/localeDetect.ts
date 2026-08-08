/**
 * Locale registry + best-match detection for the switcher (issue #163).
 * Kept free of React so it can be unit-checked directly — see
 * `localeDetect.check.mjs` — the same split as `warp/roomCode.ts`.
 */

export interface LocaleMeta {
  code: string;
  /** Short label shown in the switcher chrome, e.g. "EN". */
  label: string;
  /** Full name for the `title`/`aria-label` on the switcher control. */
  name: string;
}

/**
 * Every locale with a dictionary. New locales add an entry here alongside a
 * `web/src/locales/<code>.ts` file — nothing else in the switcher needs to
 * change (see `docs/TRANSLATING.md`).
 */
export const AVAILABLE_LOCALES: readonly LocaleMeta[] = [
  { code: "en", label: "EN", name: "English" },
  { code: "id", label: "ID", name: "Bahasa Indonesia" },
];

export const DEFAULT_LOCALE = "en";
export const LOCALE_STORAGE_KEY = "warp.locale";

/**
 * Matches a `navigator.languages`-shaped preference list against the
 * locales we actually have a dictionary for. Tries an exact tag match
 * first ("en-GB"), then falls back to the base language ("en"), in
 * preference order, before giving up and returning `fallback`.
 */
export function pickBestLocale(
  preferred: readonly string[],
  available: readonly string[],
  fallback: string = DEFAULT_LOCALE,
): string {
  const normalized = available.map((code) => code.toLowerCase());

  for (const raw of preferred) {
    const tag = raw.toLowerCase();
    const exact = normalized.indexOf(tag);
    if (exact !== -1) return available[exact];

    const base = tag.split("-")[0];
    const baseMatch = normalized.indexOf(base);
    if (baseMatch !== -1) return available[baseMatch];
  }

  return fallback;
}
