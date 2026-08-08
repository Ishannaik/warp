/**
 * Default denylist for folder sends (#141). Dropping a project folder onto
 * Warp via the `webkitdirectory` picker walks it recursively, so without
 * this every `node_modules`/`.git` tree would queue up alongside real
 * content. Client-side only, applied before anything is staged — not a
 * `.gitignore` parser, just a short, uncontroversial default list.
 *
 * Matching relies on `File.webkitRelativePath`, which is only populated for
 * files that came from a folder pick — a plain multi-file selection or a
 * single dropped file has no path to match against and always passes through.
 */

const NOISE_DIR_NAMES = new Set(["node_modules", ".git", ".next", "dist", "build"]);
const NOISE_FILE_NAMES = new Set([".DS_Store"]);

export interface NoiseFilterResult {
  included: File[];
  excluded: File[];
}

/** True if any path segment of a folder-picked file matches the denylist. */
export function isNoiseFile(file: File): boolean {
  const relativePath = file.webkitRelativePath;
  if (!relativePath) return false;
  const segments = relativePath.split("/");
  const filename = segments[segments.length - 1];
  if (NOISE_FILE_NAMES.has(filename)) return true;
  return segments.some((segment) => NOISE_DIR_NAMES.has(segment));
}

/** Split a picked file list into what stays queued and what's excluded by default. */
export function filterNoiseFiles(files: File[]): NoiseFilterResult {
  const included: File[] = [];
  const excluded: File[] = [];
  for (const file of files) {
    (isNoiseFile(file) ? excluded : included).push(file);
  }
  return { included, excluded };
}
