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
  common_close: "Close",

  // transfer flow (/send, /r/:code) — top bar, pre-connect steps, error panel
  transfer_step_select: "Select",
  transfer_step_pair: "Pair",
  transfer_step_session: "Session",
  transfer_step_error: "Error",
  transfer_exit: "← EXIT",
  transfer_reconnecting_banner: "CONNECTION DROPPED — RECONNECTING… TRANSFERS RESUME AUTOMATICALLY",
  transfer_heading_reconnecting: "Reconnecting…",
  transfer_heading_connected_receiver: "Connected to sender",
  transfer_heading_connected: "Connected",
  transfer_peer_label_receiver: "the sender",
  transfer_peer_label_sender: "your peer",
  transfer_queue_label: "Queue",
  transfer_queue_files_suffix: (size: string) => ` files · ${size}`,
  transfer_queue_empty: "Nothing queued yet — drop files above to begin.",
  transfer_remove_file_aria: (name: string) => `Remove ${name}`,
  transfer_step01_select: "Step 01 / Select",
  transfer_select_heading: "What are you sending?",
  transfer_drop_here: "Drop files here",
  transfer_drop_hint: "or click to browse · any size, any type",
  transfer_files_local_note: "Files stay on your device until a peer accepts.",
  transfer_open_channel: "Open secure channel  →",
  transfer_step02_pair: "Step 02 / Pair",
  transfer_waiting_joining: "Joining channel",
  transfer_waiting_for_sender: "Waiting for sender",
  transfer_waiting_one_joining: "1 device joining — opening channel",
  transfer_waiting_many_joining: (n: number) => `${n} devices joining — opening channels`,
  transfer_waiting_for_devices: "Waiting for devices to join",
  transfer_connecting_heading: "Connecting you in",
  transfer_share_heading: "Share this code",
  transfer_receiver_hint: "Hold tight — opening a direct channel to the sender.",
  transfer_pair_ready: (count: string, size: string) => `${count} files · ${size} ready to offer`,
  transfer_linking_suffix: "linking",
  transfer_copy_link_default: "⧉ Copy link",
  transfer_copy_code_default: "⬚ Copy code",
  transfer_copy_failed: "✕ copy failed",
  transfer_copy_success_link: "✓ copied!",
  transfer_share_button: "↗ Share",
  transfer_qr_aria: "QR code linking to this transfer",
  transfer_add_more_files: "Add more files",
  transfer_add_more_hint: "drop or click — edit the queue until your peer joins",
  transfer_error_eyebrow: "Channel failed",
  transfer_error_suffix:
    " Warp is STUN-only — there's no relay fallback, so some networks simply can't be bridged.",
  transfer_retry: "Try again",
  transfer_back_to_warp: "Back to Warp",
  transfer_drop_send: "Drop to send",
  transfer_release_anywhere: "Release anywhere",

  // transfer/nearby shared error copy — mapped from the engine's WarpError.kind
  // at the UI edge (only the fixed, always-identical messages are worth a fixed
  // key; the signaling/too-large kinds carry a dynamic reason and stay raw).
  error_nat_failed: "Couldn't open a direct path between the devices. One side may be on a restrictive network.",
  error_disconnected:
    "The connection dropped and couldn't be restored. Retry to reconnect — unfinished files will be offered again.",
  error_channel_error: "The data channel hit an error.",
  error_no_files: "Add at least one file before opening a channel.",

  // ErrorPanel eyebrow/title per WarpError.kind — each kind gets its own
  // honest chrome instead of borrowing the nat-failed framing (issue #174).
  error_eyebrow_nat_failed: "Channel failed",
  error_title_nat_failed: "No direct route.",
  error_eyebrow_disconnected: "Connection lost",
  error_title_disconnected: "Connection dropped.",
  error_eyebrow_channel_error: "Channel failed",
  error_title_channel_error: "The channel broke.",
  error_eyebrow_signaling: "Couldn't connect",
  error_title_signaling: "Couldn't reach the room.",
  error_eyebrow_no_files: "Nothing to send",
  error_title_no_files: "Add a file first.",
  error_eyebrow_too_large: "Too large",
  error_title_too_large: "File too large.",

  // session view (shared by the code-room and LAN flows) — tray, composer, accept modal
  transfer_status_offered: "WAITING",
  transfer_status_transferring: "MOVING",
  transfer_status_reconnecting: "RESUMING",
  transfer_status_done: "DONE",
  transfer_status_declined: "DECLINED",
  transfer_status_cancelled: "CANCELLED",
  transfer_status_error: "ERROR",
  transfer_direction_in: "↓ IN",
  transfer_direction_out: "↑ OUT",
  transfer_direction_from: "from",
  transfer_direction_to: "to",
  transfer_text_snippet_label: "Text snippet",
  transfer_cancel_aria: "Cancel transfer",
  transfer_download: "Download",
  transfer_saved_to_disk: "✓ Saved to disk",
  transfer_copy_text_default: "⧉ copy",
  transfer_copy_text_success: "✓ copied",
  transfer_compose_label: "Compose",
  transfer_composer_add_files: "＋ Add files",
  transfer_composer_send_files: "＋ Send files",
  transfer_composer_add_folder: "▤ Add a folder",
  transfer_composer_send_folder: "▤ Send a folder",
  transfer_text_placeholder: "…or paste a link / note to send as text",
  transfer_text_too_large: (size: string) =>
    `Too long to send as text (${size}). Save it as a .txt file and send that instead.`,
  transfer_fanout: (n: number) => ` to ${n} devices`,
  transfer_send_text_cta: (fanout: string) => `Send text${fanout} →`,
  transfer_ready_to_send_prefix: "Ready to send · ",
  transfer_send_files_cta: (count: number, fanout: string) =>
    `Send ${count} ${count === 1 ? "file" : "files"}${fanout} →`,
  transfer_tray_label_prefix: "Tray · ",
  transfer_download_all: "⤓ Download all (.zip)",
  transfer_tray_empty: "Nothing yet — send files or text, or wait for the other side.",
  transfer_accept_eyebrow: "Incoming · review before receiving",
  transfer_accept_wants_send_suffix: (count: number) => ` wants to send you ${count} ${count === 1 ? "item" : "items"}`,
  transfer_accept_anon: (count: number) => `Accept ${count} ${count === 1 ? "item" : "items"}?`,
  transfer_accept_large_prefix: (size: string) => `${size} total — `,
  transfer_accept_large_emphasis: "large transfer",
  transfer_accept_large_suffix: (pickTarget: string) =>
    `. On Accept you'll choose a ${pickTarget} to save to, and it streams straight to disk.`,
  transfer_accept_small_desc: (size: string) =>
    `${size} total. Nothing is saved to disk — accepted files land in your tray to download when you're ready.`,
  transfer_pick_target_folder: "folder",
  transfer_pick_target_file: "file",
  transfer_decline: "Decline",
  transfer_accept_cta: "Accept & receive",
  transfer_accept_cta_large: (pickTarget: string) => `Accept & choose ${pickTarget}`,
  transfer_devices_connected: (connected: number, total: number) =>
    `${connected} of ${total} devices connected · direct P2P`,
  transfer_heading_direct_p2p: (heading: string) => `${heading} · direct P2P`,
  transfer_session_footer: "Channel stays open — send again or send back any time · do not close this tab",
  transfer_heading_session_open: "Session open",

  // nearby devices (/) — LAN auto-discovery panel
  nearby_eyebrow: "On your network",
  nearby_you_appear_as: "You appear as",
  nearby_rename_device: "Rename device",
  nearby_heading: "Devices nearby.",
  nearby_description:
    "Same Wi-Fi, no code. Tap a device to offer files straight across — they review and accept before anything moves, and the bytes go peer-to-peer, never touching a server.",
  nearby_tap_to_send: "Tap to send",
  nearby_empty_heading: "No other devices yet",
  nearby_empty_hint: "Open Warp on another device on the same Wi-Fi.",
  nearby_crowded_message: "Too many devices on this network to auto-list — use a code instead.",
  nearby_use_code: "Use a code →",
  nearby_error_suffix: "Warp is STUN-only — some networks can't be bridged directly.",
  nearby_close_session_aria: "Close session",
  nearby_heading_opening: "Opening channel",
  // The dictionary mixes plain strings with parameterized template functions of
  // varying arity/argument types — a single conformance check needs `any` here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} satisfies Record<string, string | ((...args: any[]) => string)>;

export default en;
