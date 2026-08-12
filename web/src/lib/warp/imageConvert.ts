/**
 * Best-effort HEIC/HEIF -> JPEG conversion for the receive-side "Save as JPEG"
 * option (#258). An iPhone photo saved as `.heic` won't open on most Windows
 * and Linux machines; PairDrop converts these on the fly and this mirrors it.
 *
 * Offer conversion, never force it: the receiver already accepted the
 * original file, so the caller must keep it downloadable regardless of what
 * this returns.
 */

/** Mime types this option targets. */
export function isHeicMime(mime: string): boolean {
  return mime === "image/heic" || mime === "image/heif";
}

// Same ceiling and reasoning as THUMB_SOURCE_MAX in peer.ts's makeThumb: this
// runs eagerly (on receipt, not on click), so an unbounded decode + full-size
// canvas + encode of a dimension-heavy photo would stall the tab or exhaust
// memory before the user ever asked for a JPEG. Above this, the option is
// skipped — the original stays downloadable either way.
const CONVERT_SOURCE_MAX = 50 * 1024 * 1024;

/** Extracted so the cap is testable on its own, independent of DOM/createImageBitmap
 *  availability (a Node check has neither, which would otherwise mask this branch). */
export function exceedsConvertSizeCap(byteLength: number): boolean {
  return byteLength > CONVERT_SOURCE_MAX;
}

/**
 * Converts `source` to a JPEG Blob, or undefined if the browser can't decode
 * it (or the file is too large to convert eagerly — see exceedsConvertSizeCap).
 * Safari decodes HEIC; most others do not — `createImageBitmap` rejecting IS
 * the feature detection here, so the caller can skip the option entirely
 * rather than shipping a ~1 MB wasm HEIC decoder for a minority file type.
 *
 * Full-size draw (not thumbnail scale, unlike makeThumb in peer.ts): this
 * produces the file the user saves, not a preview. Never rejects — every
 * failure path (decode, canvas allocation, draw, encode) resolves to
 * undefined, since the caller treats this as best-effort with no `.catch`.
 */
export async function convertToJpeg(source: Blob, quality = 0.92): Promise<Blob | undefined> {
  if (exceedsConvertSizeCap(source.size)) return undefined;
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return undefined;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    return undefined;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, 0, 0);
    return await new Promise<Blob | undefined>((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? undefined), "image/jpeg", quality);
    });
  } catch {
    return undefined;
  } finally {
    bitmap.close();
  }
}

/** Swaps (or appends) a `.jpg` extension onto a HEIC/HEIF filename. */
export function jpegFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem}.jpg`;
}
