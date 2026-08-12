import type { Direction, TransferStatus } from "./transfer";

/** Which guard set a status change belongs in. Pause parks the key; cancel
 *  poisons it. Getting these backwards breaks resume. */
export type GuardTarget = "paused" | "cancelled" | "none";

/**
 * Extracted so the pause-vs-cancel decision — the one line the whole
 * pause/resume feature turns on — can be exercised by a `.check.mjs` harness
 * directly, rather than only through a hand-mirrored copy of useWarpTransfer's
 * logic that can't catch a regression in the line it mirrors.
 */
export function guardTargetFor(status: TransferStatus, direction: Direction): GuardTarget {
  if (direction !== "receive") return "none";
  if (status === "paused") return "paused";
  if (status === "cancelled") return "none"; // cancel routes elsewhere, see cancel()
  return "none";
}
