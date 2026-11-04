/**
 * Gives the child a file. Most browsers save it from a link. On an iPad (including Chrome there, which
 * is Safari underneath) a link often does nothing useful, so the share sheet is used instead, which can
 * send the file to the Files app.
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: { files: File[]; title?: string }) => Promise<void> };
  const iPad = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iPad && nav.share && nav.canShare) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: filename });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // the child closed the share sheet
        // anything else: try the plain link below
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
