"use client";

import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { apiDownloadDocumentAsset } from "@/lib/api/discussions";

export interface DocumentAssetContext { workspaceId: string; sessionId: string }

/** Images use the authenticated desktop transport; credentials never enter an image URL. */
export function DocumentAssetImage({ source, caption, context }: { source: string; caption: string; context: DocumentAssetContext }) {
  const [data, setData] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { workspaceId, sessionId } = context;
  useEffect(() => {
    const controller = new AbortController();
    void apiDownloadDocumentAsset(workspaceId, sessionId, source.slice("kin-asset:".length), controller.signal)
      .then(file => { if (!controller.signal.aborted) { setData("data:image/png;base64," + file.contentBase64); setFailed(false); } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [source, workspaceId, sessionId, attempt]);
  return (
    <span className="my-4 block text-center" role="group" aria-label={caption || "Document figure"}>
      {data ? (
        // Authenticated raster bytes are already decoded and bounded by the backend; no remote image optimizer is involved.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data} alt={caption} className="mx-auto h-auto max-w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700" />
      ) : failed ? (
        <span className="flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
          <ImageOff className="size-4" />This document image could not be loaded.
          <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }} className="font-semibold underline">Retry</button>
        </span>
      ) : <span role="status" className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 p-8 text-xs text-slate-500 dark:bg-slate-800"><Loader2 className="size-4 animate-spin" />Loading document image</span>}
      {caption && <span className="mt-2 block text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{caption}</span>}
    </span>
  );
}
