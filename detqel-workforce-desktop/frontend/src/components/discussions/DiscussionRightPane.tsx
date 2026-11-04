"use client";

import React, { useState, useEffect } from "react";
import {
  Download,
  UploadCloud,
  FileText,
  FileJson,
  Copy,
  Check,
  BookOpen,
  Plug,
  ExternalLink,
  Trash2,
  Database,
  Layers,
  Sparkles,
  Link as LinkIcon,
  Loader2,
} from "lucide-react";
import { pageIds } from "@/lib/navigation";
import { useNavigation } from "@/context/NavigationContext";
import type { DiscussionTarget } from "@/lib/discussionStore";
import { connectorsApi, type ConnectorRecord } from "@/lib/api/connectors";

interface UploadedArtifact {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadedAt: string;
}

interface DiscussionRightPaneProps {
  activeTarget: DiscussionTarget | null;
  workspaceId?: string;
  messages: Array<{ role: string; content: string; sender?: string; timestamp: string }>;
  onClose?: () => void;
}

export const DiscussionRightPane: React.FC<DiscussionRightPaneProps> = ({
  activeTarget,
  workspaceId,
  messages,
}) => {
  const { navigate } = useNavigation();
  const [activeTab, setActiveTab] = useState<"artifacts" | "knowledge" | "connectors">("artifacts");
  const [isCopied, setIsCopied] = useState(false);
  const [uploadedArtifacts, setUploadedArtifacts] = useState<UploadedArtifact[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [isLoadingConnectors, setIsLoadingConnectors] = useState(false);

  // Fetch real connectors for this workspace
  useEffect(() => {
    if (!workspaceId) {
      setConnectors([]);
      return;
    }
    let active = true;
    setIsLoadingConnectors(true);
    connectorsApi
      .list({ workspaceId })
      .then((items) => {
        if (active) setConnectors(items || []);
      })
      .catch(() => {
        if (active) setConnectors([]);
      })
      .finally(() => {
        if (active) setIsLoadingConnectors(false);
      });

    return () => {
      active = false;
    };
  }, [workspaceId]);

  // Handle Export as Markdown
  const handleExportMarkdown = () => {
    const header = `# Discussion Transcript with ${activeTarget?.name || "AI Workforce"}\nDate: ${new Date().toLocaleDateString()}\n\n`;
    const body = messages
      .map(
        (m) =>
          `### ${m.sender || (m.role === "user" ? "User" : "Agent")} (${m.timestamp})\n${m.content}\n`
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Discussion-${activeTarget?.name || "Session"}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle Export as JSON
  const handleExportJSON = () => {
    const data = {
      target: activeTarget,
      exportedAt: new Date().toISOString(),
      messages,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Discussion-${activeTarget?.name || "Session"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy Transcript to Clipboard
  const handleCopyTranscript = () => {
    const text = messages
      .map(
        (m) =>
          `[${m.timestamp}] ${m.sender || (m.role === "user" ? "User" : "Agent")}: ${m.content}`
      )
      .join("\n\n");
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // File Upload Simulation
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const newArt: UploadedArtifact = {
      id: `art-${Date.now()}`,
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
      type: file.type || "Document",
      uploadedAt: "Just now",
    };
    setUploadedArtifacts((prev) => [newArt, ...prev]);
  };

  const handleRemoveArtifact = (id: string) => {
    setUploadedArtifacts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md flex flex-col h-full overflow-hidden select-none">
      {/* Top Header & Tabs */}
      <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-muted text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Session Resources
            </h3>
          </div>
        </div>

        {/* Resource Tabs */}
        <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-[11px] font-semibold">
          <button
            onClick={() => setActiveTab("artifacts")}
            className={`py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "artifacts"
                ? "bg-white dark:bg-slate-900 text-primary shadow-xs font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Artifacts
          </button>
          <button
            onClick={() => setActiveTab("knowledge")}
            className={`py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "knowledge"
                ? "bg-white dark:bg-slate-900 text-primary shadow-xs font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Knowledge
          </button>
          <button
            onClick={() => setActiveTab("connectors")}
            className={`py-1.5 rounded-lg transition-all cursor-pointer ${
              activeTab === "connectors"
                ? "bg-white dark:bg-slate-900 text-primary shadow-xs font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Connectors
          </button>
        </div>
      </div>

      {/* Pane Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeTab === "artifacts" ? (
          <div className="space-y-5">
            {/* Export Actions Section */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Export Session Artifacts
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleExportMarkdown}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 hover:border-primary hover:text-primary text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Markdown</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportJSON}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 hover:border-primary hover:text-primary text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                >
                  <FileJson className="h-3.5 w-3.5" />
                  <span>JSON Spec</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyTranscript}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 hover:border-primary hover:text-primary text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all cursor-pointer shadow-xs"
              >
                {isCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Transcript Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Full Transcript</span>
                  </>
                )}
              </button>
            </div>

            {/* Upload Artifacts Section */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Upload Workspace Artifact
              </span>
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-primary rounded-2xl bg-slate-50/40 dark:bg-slate-800/20 hover:bg-primary-muted transition-all cursor-pointer text-center group">
                <UploadCloud className="h-7 w-7 text-slate-400 group-hover:text-primary group-hover:scale-110 transition-all mb-1.5" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-primary transition-colors">
                  Upload file or specification
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  PDF, DOCX, CSV, JSON, MD (up to 25MB)
                </span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".pdf,.docx,.doc,.csv,.json,.md,.txt"
                />
              </label>
            </div>

            {/* Uploaded Artifacts List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Active Artifacts ({uploadedArtifacts.length})
                </span>
              </div>

              {uploadedArtifacts.length === 0 ? (
                <div className="text-center p-4 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  No artifacts attached to this discussion.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {uploadedArtifacts.map((art) => (
                    <div
                      key={art.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-primary">
                          <FileText className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block">
                            {art.name}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {art.size} • {art.uploadedAt}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveArtifact(art.id)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Remove artifact"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === "knowledge" ? (
          <div className="space-y-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Workspace Knowledge Base ({knowledgeDocs.length})
            </span>

            {knowledgeDocs.length === 0 ? (
              <div className="text-center p-6 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <BookOpen className="h-6 w-6 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="font-semibold text-slate-600 dark:text-slate-400">No knowledge base documents indexed</p>
                <p className="text-[11px] text-slate-400 mt-1">Knowledge context will be populated once documents are added to the workspace.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {knowledgeDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {doc.title}
                        </h4>
                        <span className="text-[10px] text-slate-400 block">
                          {doc.type}
                        </span>
                      </div>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 shrink-0">
                        Indexed
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Connected Operational Tools ({connectors.length})
            </span>

            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Connectors Hub
                </span>
                <button
                  type="button"
                  onClick={() => navigate(pageIds.connectors)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
                >
                  <span>Manage</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                AI agents in discussions use authorized connectors to perform tasks and inspect infrastructure.
              </p>
            </div>

            {isLoadingConnectors ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : connectors.length === 0 ? (
              <div className="text-center p-6 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <Plug className="h-6 w-6 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="font-semibold text-slate-600 dark:text-slate-400">No active connectors</p>
                <p className="text-[11px] text-slate-400 mt-1">No operational connectors configured for this workspace.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {connectors.map((conn) => (
                  <div
                    key={conn.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900 shadow-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
                        <Plug className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block">
                          {conn.name}
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate">
                          {conn.provider} • {conn.connectionType}
                        </span>
                      </div>
                    </div>

                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      {conn.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate(pageIds.connectors)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              <Plug className="h-3.5 w-3.5 text-primary" />
              <span>Configure New Connector</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

