/**
 * Streaming "download all (.zip)" for received files (issue #28).
 *
 * The old path called fflate's SYNCHRONOUS `zipSync`, which (a) blocked the main
 * thread for the whole archive build — seconds of frozen UI on a phone — and
 * (b) materialized a second full copy of every received blob in memory, so a
 * 1.5 GB batch peaked at ~3 GB and OOM-killed mobile tabs. The engine goes to
 * heroic lengths to avoid buffering (disk streaming, OPFS/IDB staging); zipSync
 * undid it at the last step.
 *
 * This helper streams instead: fflate's `Zip` + `ZipPassThrough` (compression 0 —
 * received files are usually already compressed, so pass-through is right and the
 * CRC is still computed incrementally by the pass-through). Each blob is fed in
 * ~2 MiB slices via `blob.slice().arrayBuffer()`, yielding to the event loop
 * between slices, so the main thread never blocks and peak memory is ~(output so
 * far + one slice) instead of 2× total.
 *
 * True zero-buffer streaming straight to disk needs the service-worker download
 * path (issue #33); until then the archive is still assembled into one final Blob
 * from the collected output chunks. The slice-and-yield structure here is what a
 * `WritableStream` sink would later replace — swap the `chunks` array for a stream
 * and the rest of the pipeline is unchanged.
 */

import { Zip, ZipPassThrough } from "fflate";

/** One received file to pack: its (de-duped downstream) name and in-memory blob. */
export interface ZipEntry {
  name: string;
  blob: Blob;
}

/** Feed each blob to the archive in slices this size, yielding between them. */
const ZIP_SLICE_BYTES = 2 * 1024 * 1024;

/** De-dupe a filename within the archive so entries don't clobber each other. */
function uniqueName(used: Set<string>, name: string): string {
  const base = name || "file";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let n = 2;
  while (used.has(`${stem} (${n})${ext}`)) n += 1;
  const out = `${stem} (${n})${ext}`;
  used.add(out);
  return out;
}

/** Trigger a browser download of a blob via a transient object-URL anchor. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Zip `entries` (stored/pass-through, level 0) and download the archive as
 * `outName`, streaming slice-by-slice so the UI stays responsive. `onProgress`,
 * if given, is called with (bytesPacked, totalBytes) as each slice lands — the
 * tray button can render "zipping… 34%" instead of freezing with no feedback.
 * Resolves once the download has been triggered; rejects on an archive error.
 */
export async function streamZipDownload(
  entries: ZipEntry[],
  outName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (!entries.length) return;

  const total = entries.reduce((s, e) => s + e.blob.size, 0);
  // fflate's stream handler yields Uint8Array<ArrayBuffer>; keep that precise
  // type so the collected chunks stay valid BlobParts for the final Blob.
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let packed = 0;

  await new Promise<void>((resolve, reject) => {
    const zip = new Zip((err, chunk, final) => {
      if (err) {
        reject(err);
        return;
      }
      chunks.push(chunk);
      if (final) resolve();
    });

    void (async () => {
      try {
        const used = new Set<string>();
        for (const entry of entries) {
          const pt = new ZipPassThrough(uniqueName(used, entry.name));
          zip.add(pt);
          const size = entry.blob.size;
          if (size === 0) {
            pt.push(new Uint8Array(0), true);
          } else {
            for (let off = 0; off < size; off += ZIP_SLICE_BYTES) {
              const end = Math.min(off + ZIP_SLICE_BYTES, size);
              const buf = new Uint8Array(await entry.blob.slice(off, end).arrayBuffer());
              pt.push(buf, end >= size);
              packed += buf.byteLength;
              onProgress?.(packed, total);
              // Yield so rendering/scroll keeps working between slices (the whole
              // point vs zipSync — issue #28).
              await new Promise((r) => setTimeout(r, 0));
            }
          }
        }
        zip.end();
      } catch (err) {
        try {
          zip.terminate();
        } catch {
          /* already torn down */
        }
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });

  saveBlob(new Blob(chunks, { type: "application/zip" }), outName);
}
