"use client";

import { useCallback } from "react";
import { useToast } from "@/context/ToastContext";
import { saveBlobDownload } from "@/lib/download";

/** Generated downloads use the same feedback and history as agent documents. */
export function useFileDownload() {
  const toast = useToast();
  return useCallback((blob: Blob, fileName: string) => {
    try { toast.download(saveBlobDownload(blob, fileName)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not download the file."); }
  }, [toast]);
}
