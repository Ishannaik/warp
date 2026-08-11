/**
 * Receive-strategy selection — the single source of truth for HOW an accepted
 * batch lands (issue #54).
 *
 * Before this module existed the decision was hand-duplicated in two places
 * that had to agree but nothing forced to:
 *   - `useWarpTransfer.ts`'s `accept()` chose the real sink (stream to disk via
 *     a picker, or accumulate in memory), and
 *   - `SessionView.tsx`'s `AcceptModal` re-derived the SAME facts purely to word
 *     its copy ("expect a folder/file picker on Accept").
 * Both redefined `LARGE_THRESHOLD` and each spelled the File System Access
 * capability check differently (`!!fs.showDirectoryPicker` vs.
 * `"showSaveFilePicker" in window`). Two copies of the threshold and two forms
 * of the capability check is drift waiting to happen: bump the constant in one
 * file and the modal's copy silently lies about what `accept()` will do.
 *
 * So: one `LARGE_THRESHOLD`, one capability detector, and one pure
 * `chooseReceiveStrategy()` both sites call. The decision is pure (no DOM, no
 * window reach beyond the injected capability object) so it's unit-testable in
 * the engine check harness (`receiveStrategy.check.mjs`).
 *
 * This only centralizes the SELECTION. It adds no strategy and changes none of
 * the thresholds — the disk / OPFS / IndexedDB / memory sinks and the 256 MiB
 * line are exactly as before. The user-gesture timing around actually OPENING
 * the picker stays in `accept()` (that subtlety is load-bearing — see there).
 */

/**
 * At/above this many bytes — total batch OR any single file — a batch is "large"
 * and streams straight to disk (via a picker where the File System Access API
 * exists) instead of accumulating an in-memory Blob that would crash the tab on
 * a multi-GB transfer. Below it we keep the small-file in-memory tray.
 */
export const LARGE_THRESHOLD = 256 * 1024 * 1024;

import { showSaveFilePicker as ponyfillShowSaveFilePicker } from "native-file-system-adapter";

/** What the File System Access API can do on this browser (both false if absent). */
export interface FsAccessSupport {
  /** `showSaveFilePicker` exists — can stream a single file to a chosen path. */
  canSaveFile: boolean;
  /** `showDirectoryPicker` exists — can stream a multi-file batch into a folder. */
  canPickDirectory: boolean;
  /** The picker function to use for a single file (native or ponyfill). */
  showSaveFilePicker?: typeof window.showSaveFilePicker;
  /** The picker function to use for a directory (native only). */
  showDirectoryPicker?: typeof window.showDirectoryPicker;
}

/**
 * The File System Access API surface we probe. `lib.dom` doesn't model these
 * (they're still experimental), so we declare just the two pickers and accept an
 * opaque `win` — callers pass `window`, the check harness passes a fake.
 */
interface FsPickerWindow {
  showSaveFilePicker?: typeof window.showSaveFilePicker;
  showDirectoryPicker?: typeof window.showDirectoryPicker;
}

/**
 * Detect the File System Access pickers once, as a small capability object.
 * `win` defaults to the global `window` when present; a missing window (SSR,
 * Node checks) or missing pickers yield `{ false, false }` — never a throw.
 */
export function detectFsAccessSupport(win?: unknown): FsAccessSupport {
  const w: FsPickerWindow | undefined =
    win !== undefined
      ? (win as FsPickerWindow)
      : typeof window !== "undefined"
        ? (window as unknown as FsPickerWindow)
        : undefined;

  const nativeSave = typeof w?.showSaveFilePicker === "function";
  const nativeDir = typeof w?.showDirectoryPicker === "function";

  return {
    canSaveFile: true, // Ponyfill covers save file everywhere
    canPickDirectory: nativeDir, // Ponyfills do not support directory-write, so we only allow native
    showSaveFilePicker: nativeSave && w ? w.showSaveFilePicker.bind(w) : ponyfillShowSaveFilePicker,
    showDirectoryPicker: nativeDir && w ? w.showDirectoryPicker.bind(w) : undefined,
  };
}

/**
 * Is a batch "large" (should leave the in-memory tray)? True when the total OR
 * any single file reaches `LARGE_THRESHOLD`. Accepts the already-reduced total
 * and biggest size so callers don't re-walk the manifest.
 */
export function isLargeBatch(total: number, biggest: number): boolean {
  return total >= LARGE_THRESHOLD || biggest >= LARGE_THRESHOLD;
}

/**
 * Where a large batch should land. `'disk-dir'` / `'disk-file'` mean "prompt the
 * matching picker and stream to disk"; `'memory'` means "no disk path available
 * (small batch, or no File System Access API), use the in-memory / origin-storage
 * fallback." A multi-file batch needs the directory picker; a single file needs
 * the save-file picker — a browser with only one of the two gets `'memory'` for
 * the shape it can't pick. This mirrors `accept()`'s prior inline decision
 * exactly; it does not widen or narrow it.
 */
export type ReceiveStrategy = "disk-dir" | "disk-file" | "memory";

export function chooseReceiveStrategy(opts: {
  itemCount: number;
  large: boolean;
  fs: FsAccessSupport;
}): ReceiveStrategy {
  const { itemCount, large, fs } = opts;
  if (!large) return "memory";
  if (itemCount > 1) return fs.canPickDirectory ? "disk-dir" : "memory";
  return fs.canSaveFile ? "disk-file" : "memory";
}
