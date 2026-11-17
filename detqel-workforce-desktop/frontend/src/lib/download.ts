import type { DownloadableFile } from "@/lib/api/discussions";

export interface DownloadReceipt { fileName: string; size: number }

/** Saves base64 content returned by the server through the browser's download. */
export function saveDownload(file: DownloadableFile): DownloadReceipt {
  const bytes = Uint8Array.from(atob(file.contentBase64), character => character.charCodeAt(0));
  return saveBlobDownload(new Blob([bytes], { type: file.mimeType }), file.fileName);
}

/** Shared save path for document, transcript, workflow, and result downloads. */
export function saveBlobDownload(blob: Blob, fileName: string): DownloadReceipt {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    return { fileName, size: blob.size };
  } finally {
    anchor.remove();
    // Keep the URL alive while the browser begins the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
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
