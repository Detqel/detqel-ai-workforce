"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Download, File, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import {
  apiDeleteSessionArtifact,
  apiDownloadSessionArtifact,
  apiExportSessionArtifact,
  apiListSessionArtifacts,
  apiUploadSessionArtifact,
  type ExportFormat,
  type SessionArtifact,
} from "@/lib/api/discussions";
import { ARTIFACT_UPLOAD_MAX_BYTES } from "@/constants/discussionConstants";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { formatFileSize, readAsBase64, saveDownload } from "@/lib/download";
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

/** The files a discussion keeps: documents agents wrote, exported replies, and files the user added. */
export function SessionArtifacts({ workspaceId, sessionId, version }: SessionArtifactsProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [artifacts, setArtifacts] = useState<SessionArtifact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

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
  }, [workspaceId, sessionId, version, reloadKey, toast]);

  const download = async (artifact: SessionArtifact) => {
    if (!workspaceId || !sessionId) return;
    try {
      saveDownload(await apiDownloadSessionArtifact(workspaceId, sessionId, artifact.fileName));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the file.");
    }
  };

  const convert = async (artifact: SessionArtifact, format: ExportFormat) => {
    if (!workspaceId || !sessionId) return;
    try {
      // Markdown is the document itself; Word and PDF are made from it and kept beside it.
      const file = format === "md"
        ? await apiDownloadSessionArtifact(workspaceId, sessionId, artifact.fileName)
        : await apiExportSessionArtifact(workspaceId, sessionId, artifact.fileName, format);
      saveDownload(file);
      if (format !== "md") {
        reload();
        toast.success(`Exported ${file.fileName}.`);
      }
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

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!workspaceId || !sessionId) { toast.error("Open a discussion before adding files."); return; }
    if (file.size > ARTIFACT_UPLOAD_MAX_BYTES) { toast.error(`"${file.name}" is larger than ${formatFileSize(ARTIFACT_UPLOAD_MAX_BYTES)}.`); return; }
    setIsUploading(true);
    try {
      const contentBase64 = await readAsBase64(file);
      await apiUploadSessionArtifact(workspaceId, sessionId, { fileName: file.name, mimeType: file.type || "application/octet-stream", contentBase64 });
      reload();
      toast.success(`Added "${file.name}" to this discussion.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the file.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Add a file</span>
        <label className={`flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-primary rounded-2xl bg-slate-50/40 dark:bg-slate-800/20 hover:bg-primary-muted transition-all cursor-pointer text-center group ${isUploading || !sessionId ? "opacity-50 pointer-events-none" : ""}`}>
          {isUploading
            ? <Loader2 className="h-7 w-7 text-primary animate-spin mb-1.5" />
            : <UploadCloud className="h-7 w-7 text-slate-400 group-hover:text-primary group-hover:scale-110 transition-all mb-1.5" />}
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
            Upload file or specification
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5">PDF, DOCX, CSV, JSON, MD, TXT · up to {formatFileSize(ARTIFACT_UPLOAD_MAX_BYTES)}</span>
          <input type="file" onChange={upload} className="hidden" accept=".pdf,.docx,.doc,.csv,.json,.md,.txt,.png,.jpg,.jpeg" disabled={isUploading || !sessionId} />
        </label>
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saved in this discussion ({artifacts.length})</span>
        {isLoading && artifacts.length === 0 ? (
          <div className="flex items-center justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : artifacts.length === 0 ? (
          <div className="text-center p-4 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            Nothing saved yet. Documents agents write and replies you export appear here.
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
    </>
  );
}
