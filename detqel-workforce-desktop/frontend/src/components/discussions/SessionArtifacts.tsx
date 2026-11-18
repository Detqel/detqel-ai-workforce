"use client";

import React, { useEffect, useState } from "react";
import { Download, File, FileText, Loader2, Trash2 } from "lucide-react";
import {
  apiDeleteSessionArtifact,
  apiDownloadSessionArtifact,
  apiExportSessionArtifact,
  apiListSessionArtifacts,
  type ExportFormat,
  type SessionArtifact,
} from "@/lib/api/discussions";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { formatFileSize, saveDownload } from "@/lib/download";
import { ExportMenu } from "./ExportMenu";
import { formatTime } from "./discussionView";

interface SessionArtifactsProps {
  workspaceId?: string;
  sessionId?: string;
  /** Changes whenever the chat saved something here, so the list reloads. */
  version: number;
}

const isMarkdown = (fileName: string) => fileName.toLowerCase().endsWith(".md");

function modified(iso: string): string {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  return today ? formatTime(date) : date.toLocaleDateString();
}

/** The generated documents saved in a discussion. */
export function SessionArtifacts({ workspaceId, sessionId, version }: SessionArtifactsProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [artifacts, setArtifacts] = useState<SessionArtifact[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!workspaceId || !sessionId) {
      Promise.resolve().then(() => { if (active) setArtifacts([]); });
      return () => { active = false; };
    }
    Promise.resolve().then(() => { if (active) setIsLoading(true); });
    apiListSessionArtifacts(workspaceId, sessionId)
      .then((items) => { if (active) setArtifacts(items); })
      .catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "Could not load the discussion's artifacts."); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [workspaceId, sessionId, version, toast]);

  const download = async (artifact: SessionArtifact) => {
    if (!workspaceId || !sessionId) return;
    try {
      const file = await apiDownloadSessionArtifact(workspaceId, sessionId, artifact.fileName);
      toast.download(saveDownload(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the file.");
    }
  };

  const convert = async (artifact: SessionArtifact, format: ExportFormat) => {
    if (!workspaceId || !sessionId) return;
    try {
      // Markdown is the source document; converted formats are download-only.
      const file = format === "md"
        ? await apiDownloadSessionArtifact(workspaceId, sessionId, artifact.fileName)
        : await apiExportSessionArtifact(workspaceId, sessionId, artifact.fileName, format);
      toast.download(saveDownload(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export the document.");
    }
  };

  const remove = async (artifact: SessionArtifact) => {
    if (!workspaceId || !sessionId) return;
    const confirmed = await confirm({ title: "Remove file", message: `Remove "${artifact.fileName}" from this discussion? This cannot be undone.`, variant: "danger", confirmText: "Remove" });
    if (!confirmed) return;
    try {
      await apiDeleteSessionArtifact(workspaceId, sessionId, artifact.fileName);
      setArtifacts((prev) => prev.filter((item) => item.fileName !== artifact.fileName));
      toast.success(`Removed ${artifact.fileName}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the file.");
    }
  };

  return (
      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saved in this discussion ({artifacts.length})</span>
        {isLoading && artifacts.length === 0 ? (
          <div className="flex items-center justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : artifacts.length === 0 ? (
          <div className="text-center p-4 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            No documents yet. Documents generated in this discussion appear here.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {artifacts.map((artifact) => (
              <li key={artifact.fileName} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-primary">
                    {isMarkdown(artifact.fileName) ? <FileText className="h-3.5 w-3.5" /> : <File className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block" title={artifact.fileName}>{artifact.fileName}</span>
                    <span className="text-[10px] text-slate-400 block">{formatFileSize(artifact.size)} · {modified(artifact.modifiedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {isMarkdown(artifact.fileName) ? (
                    <ExportMenu onExport={(format) => convert(artifact, format)} label={`Export ${artifact.fileName}`} />
                  ) : (
                    <button type="button" onClick={() => void download(artifact)} title="Download" aria-label={`Download ${artifact.fileName}`} className="p-1 text-slate-400 hover:text-primary rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button type="button" onClick={() => void remove(artifact)} title="Remove" aria-label={`Remove ${artifact.fileName}`} className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
  );
}
