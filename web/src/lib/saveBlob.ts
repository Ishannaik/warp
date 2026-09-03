/** Trigger a browser download of a blob via a transient object-URL anchor. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has had time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
