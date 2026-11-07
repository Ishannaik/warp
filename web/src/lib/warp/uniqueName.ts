/**
 * Collision-free filenames for the directory-picker receive path (#133).
 *
 * Extracted from useWarpTransfer (no React import) so `useWarpTransfer.check.mjs`
 * exercises the real de-dupe rather than a hand-mirrored copy (#341).
 */

import type { FsDirHandle, FsWritable } from "./peer";

/**
 * The folder probe could not tell whether a name is free (#352).
 *
 * `cause` is the probe's own error (a revoked permission, a transient FS
 * error), kept so the original failure is not lost.
 */
export class UnverifiedNameError extends Error {
  readonly fileName: string;
  constructor(fileName: string, cause: unknown) {
    super(`Could not check whether "${fileName}" already exists in the chosen folder`, { cause });
    this.name = "UnverifiedNameError";
    this.fileName = fileName;
  }
}

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
  return (await probeInDir(dir, name)).state;
}

/** existsInDir, plus the error behind an "unknown" so it can be reported. */
async function probeInDir(
  dir: FsDirHandle,
  name: string,
): Promise<{ state: boolean | "unknown"; error?: unknown }> {
  try {
    await dir.getFileHandle(name);
    return { state: true };
  } catch (err) {
    return (err as { name?: string } | null)?.name === "NotFoundError"
      ? { state: false }
      : { state: "unknown", error: err };
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
 * A candidate is only returned once the probe CONFIRMS it is absent. When a
 * probe is inconclusive this throws `UnverifiedNameError` instead (#352): the
 * caller would open the name with `create: true`, and if the probe failed
 * transiently while the file does exist, that open succeeds and
 * `createWritable()` truncates it, the very overwrite #133 fixed. It does not
 * move on to the next candidate either: a persistent error would then skip or
 * loop over names.
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
      const probe = dir ? await probeInDir(dir, candidate) : { state: false };
      if (probe.state === "unknown") throw new UnverifiedNameError(candidate, probe.error);
      if (probe.state === false) {
        used.add(candidate);
        return candidate;
      }
    }
    candidate = `${stem} (${n})${ext}`;
  }
}

/**
 * Resolve a de-duped name in `dir` and the opener for its writable, for one file
 * of a folder receive.
 *
 * If the name cannot be verified free, `savedName` is undefined and `open`
 * rejects with the `UnverifiedNameError` without touching the folder. A failed
 * open poisons only that file's sink, so the rest of the batch still lands and
 * nothing is ever opened with `create: true` on an unchecked name.
 */
export async function folderTarget(
  used: Set<string>,
  name: string,
  dir: FsDirHandle,
): Promise<{ savedName: string | undefined; open: () => Promise<FsWritable> }> {
  let savedName: string;
  try {
    savedName = await uniqueName(used, name, dir);
  } catch (err) {
    return { savedName: undefined, open: () => Promise.reject(err) };
  }
  return { savedName, open: async () => (await dir.getFileHandle(savedName, { create: true })).createWritable() };
}
