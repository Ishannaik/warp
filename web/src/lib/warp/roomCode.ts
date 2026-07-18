/**
 * Shared room-code alphabet helpers — matches the signaling server's
 * `CODE_ALPHABET` / `ROOM_RE` in `server/src/index.js`. Client-side only for
 * fast format checks; the server remains the authority.
 */

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
