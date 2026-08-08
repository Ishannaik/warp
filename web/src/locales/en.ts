/**
 * The English string table — the source of truth for every user-facing
 * string in the app, and the shape every other locale is typed against
 * (see `../lib/i18n.ts`).
 *
 * Flat keys, `surface_purpose` naming (e.g. `receive_heading`). Anything
 * with a count or a name is a template function, never string
 * concatenation — English word order doesn't hold in other languages.
 */
const en = {
  // receive entry (/receive) — enter a room code by hand
  receive_eyebrow: "Receive · enter a code",
  receive_heading: "Receive a file",
  receive_description:
    "Enter the 6-character code from the sending device, or open their link / scan their QR.",
  receive_code_label: "Room code",
  receive_code_placeholder: "••••••",
  receive_hint_invalid: "That doesn't look like a valid code — check the sending device.",
  receive_hint_format: "Letters A–Z (no I, L, O) and digits 2–9.",
  receive_connect: "Connect  →",
  receive_footer: "Got a link instead? Just open it — it connects you automatically.",

  // chrome shared across surfaces
  common_wordmark: "WARP",
  common_back: "← BACK",
} satisfies Record<string, string>;

export default en;
