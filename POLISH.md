# Warp — copy polish pass

Date: 2026-08-02
Scope: every user-facing string in `web/src/` — error tables, empty states, waiting/pairing copy, accept modal, tray status labels, buttons, placeholders, the 404 page, and the nearby-devices surface. Copy-only changes; no functionality touched.

## Strings fixed

| Where | Before | After |
|---|---|---|
| `web/src/lib/warp/useWarpTransfer.ts` (`ERROR_MESSAGES["channel-error"]`, shown on the room/code transfer error screen) | `The data channel hit an error.` | `The direct link between the devices hit an error. Retry to reconnect.` |
| `web/src/nearby/useNearbyTransfer.ts` (`PEER_ERROR_COPY["channel-error"]`, shown in the nearby-device session panel) | `The data channel hit an error.` | `The direct link to the other device broke.` |
| `web/src/nearby/useNearbyTransfer.ts` (inline `failSession` when an offer fails once the channel is up) | `The data channel hit an error.` (duplicated literal) | Reuses `PEER_ERROR_COPY["channel-error"]` — one source of truth for the string |

Why: "data channel" is WebRTC implementation jargon; Warp's voice elsewhere is plain and honest ("Couldn't open a direct path between the devices", "The connection dropped and couldn't be restored"). The rewrites name what actually broke (the direct device-to-device link) and, on the room flow, tell the user what to do next — matching the neighbouring `disconnected` message.

## Reviewed and left as-is (already specific/branded)

- Pairing/waiting copy: "Joining channel", "Waiting for sender", "1 device joining — opening channel", "Waiting for devices to join" (`TransferFlow.tsx`).
- Nearby empty state: "No other devices yet — Open Warp on another device on the same Wi-Fi." (`NearbyDevices.tsx`).
- Accept modal: "<peer> wants to send you N items", "Accept & choose a folder" / "Accept & receive" for large batches (`SessionView.tsx`).
- Error tables: `nat-failed`, `disconnected`, `signaling`, `no-files`, `too-large` all name the cause and the remedy.
- 404: "This page doesn't exist — The link may be mistyped. Head home, or open a send / receive channel."
- Tray status labels (DONE / DECLINED / CANCELLED), placeholders ("••••••" code entry, "…or paste a link / note to send as text"), and aria-labels are all intentional.
- No generic "Loading…", "Error occurred", "Something went wrong", or "Oops" strings exist in the UI surface.

## Verification

`pnpm typecheck` + `pnpm --filter @warp/web lint` clean; engine check harnesses unaffected (copy-only change outside the wire protocol).
