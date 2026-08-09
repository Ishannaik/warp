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

/**
 * Converts `source` to a JPEG Blob, or undefined if the browser can't decode
 * it. Safari decodes HEIC; most others do not — `createImageBitmap` rejecting
 * IS the feature detection here, so the caller can skip the option entirely
 * rather than shipping a ~1 MB wasm HEIC decoder for a minority file type.
 *
 * Full-size draw (not thumbnail scale, unlike makeThumb in peer.ts): this
 * produces the file the user saves, not a preview.
 */
export async function convertToJpeg(source: Blob, quality = 0.92): Promise<Blob | undefined> {
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
