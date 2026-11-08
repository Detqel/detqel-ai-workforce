import type { DownloadableFile } from "@/lib/api/discussions";

/** Saves a file the server returned (base64 content) through the browser's download. */
export function saveDownload(file: DownloadableFile): void {
  const bytes = Uint8Array.from(atob(file.contentBase64), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked after the click has been handled, so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Reads a file the user picked as base64, for upload in a JSON request. */
export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    // A data URL is "data:<type>;base64,<content>"; only the content is sent.
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
