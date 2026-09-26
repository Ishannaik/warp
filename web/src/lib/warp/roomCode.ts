/**
 * Shared room-code alphabet helpers — matches the signaling server's
 * `CODE_ALPHABET` / `ROOM_RE` in `server/src/index.js`. Client-side only for
 * fast format checks; the server remains the authority.
 */

import { aliasToCode, looksLikeAlias } from "../../../../shared/codewords.js";

export const CODE_LEN = 6;

/** Server alphabet: A–Z minus I, L, O + digits 2–9. */
export const VALID_RE = /^[A-HJ-KM-NP-Z2-9]{6}$/;

const ALLOWED_CHARS = /[A-HJ-KM-NP-Z2-9]/g;

/** Strip whitespace/dashes, uppercase, drop disallowed chars, cap at CODE_LEN. */
export function sanitize(raw: string): string {
  const upper = raw.toUpperCase();
  const kept = upper.match(ALLOWED_CHARS)?.join("") ?? "";
  return kept.slice(0, CODE_LEN);
}

/**
 * Resolve a `/r/:code` path segment. A word alias must decode BEFORE
 * sanitize(): sanitize keeps only the code alphabet, so
 * "anchor-quartz-rocket-bamboo-lotus" would collapse into "ANCHRQ", a
 * different valid code, and join the wrong room. A lowercase code
 * ("k7p2qr") also "looks like" an alias, so it falls back to sanitize().
 * Multi-word input that fails to decode is never sanitized.
 * Returns the code to join, or what to prefill in the receive form.
 */
export function resolveDeepLink(raw: string): { join: string } | { prefill: string } {
  const fromAlias = looksLikeAlias(raw) ? aliasToCode(raw) : null;
  if (fromAlias) return { join: fromAlias };
  // Words that don't decode are a mistyped alias: never sanitize them into a
  // code, or a typo silently joins someone else's room.
  if (isWordy(raw)) return { prefill: raw };
  const cleaned = sanitize(raw);
  return VALID_RE.test(cleaned) ? { join: cleaned } : { prefill: cleaned };
}

/** Multi-word input ("anchor quartz rocket …"): a word alias, even a mistyped
 *  one. Keep it verbatim — sanitize() would mash the words into a fake code. */
export function isWordy(raw: string): boolean {
  return raw.trim().split(/[\s-]+/).filter((w) => /^[a-z]+$/i.test(w)).length >= 2;
}
