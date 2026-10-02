import { fileKey } from "./transfer";

/** Keep the first occurrence of each file not already in the pending queue. */
export function uniqueFiles(incoming: readonly File[], existing: readonly File[] = []): File[] {
  const seen = new Set(existing.map(fileKey));
  return incoming.filter((file) => {
    const key = fileKey(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
