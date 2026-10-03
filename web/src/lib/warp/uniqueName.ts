/**
 * Collision-free filenames for the directory-picker receive path (#133).
 *
 * Extracted from useWarpTransfer (no React import) so `useWarpTransfer.check.mjs`
 * exercises the real de-dupe rather than a hand-mirrored copy (#341).
 */

import type { FsDirHandle } from "./peer";

/**
 * Does `name` already exist in `dir`?
 *
 * Deliberately cheap: ONE `getFileHandle` for the exact name, never a directory
 * scan. A `NotFoundError` is the API's way of saying the slot is free.
 *
 * Returns "unknown" when the probe fails for any OTHER reason (a revoked
 * permission, a transient FS error). That third state matters: treating an
 * unreadable directory as "free" would let us overwrite a file we simply could
 * not see, and treating it as "taken" would spin forever looking for a free slot.
 */
export async function existsInDir(dir: FsDirHandle, name: string): Promise<boolean | "unknown"> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (err) {
    return (err as { name?: string } | null)?.name === "NotFoundError" ? false : "unknown";
  }
}

/**
 * De-dupe a filename for a folder target: "a.txt", "a (1).txt", …
 *
 * Two different things can collide and both are checked:
 *   - names already claimed by EARLIER FILES IN THE SAME BATCH (`used`), and
 *   - files ALREADY ON DISK in the chosen folder (`dir`).
 *
 * Without the second check, receiving `report.pdf` into a folder that already
 * holds one silently clobbered the existing file (issue #133). The existing file
 * now always wins its name and the incoming one steps aside.
 *
 * When a disk probe is inconclusive we take the current candidate and stop
 * probing, so the real `create: true` write surfaces the real error rather than
 * this helper inventing a different filename or looping.
 *
 * `dir` is optional so callers with no folder target keep the pure in-batch
 * behaviour.
 */
export async function uniqueName(used: Set<string>, name: string, dir?: FsDirHandle): Promise<string> {
  const dot = name.lastIndexOf(".");
  // dot > 0 keeps dotfiles whole: ".env" stems to ".env", not "" + ".env".
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";

  let candidate = name;
  for (let n = 1; ; n += 1) {
    if (!used.has(candidate)) {
      const onDisk = dir ? await existsInDir(dir, candidate) : false;
      if (onDisk !== true) {
        used.add(candidate);
        return candidate;
      }
    }
    candidate = `${stem} (${n})${ext}`;
  }
}
