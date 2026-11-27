"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  UploadCloud,
  FileText,
  BookOpen,
  Plug,
  ExternalLink,
  Sparkles,
  Link as LinkIcon,
  Loader2,
  Trash2,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { formatFileSize } from "@/lib/download";
import { readKnowledgeUpload } from "@/lib/knowledge-upload";
import { pageIds } from "@/lib/navigation";
import { useNavigation } from "@/context/NavigationContext";
import { connectorsApi, type ConnectorRecord } from "@/lib/api/connectors";
import {
  apiAttachSessionConnector,
  apiDeleteSessionKnowledge,
  apiDetachSessionConnector,
  apiListSessionConnectors,
  apiListSessionKnowledge,
  apiUploadSessionKnowledge,
  type KnowledgeDocument,
} from "@/lib/api/discussions";
import { KNOWLEDGE_UPLOAD_ACCEPT, KNOWLEDGE_UPLOAD_MAX_BYTES } from "@/constants/discussionConstants";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { SessionArtifacts } from "./SessionArtifacts";

interface DiscussionRightPaneProps {
  workspaceId?: string;
  activeSessionId?: string;
  /** Changes whenever the chat saved a document, so the artifacts list reloads. */
  artifactsVersion: number;
  onClose?: () => void;
  isCollapsed?: boolean;
  onExpand?: () => void;
}

export const DiscussionRightPane: React.FC<DiscussionRightPaneProps> = ({
  workspaceId,
  activeSessionId,
  artifactsVersion,
  onClose,
  isCollapsed = false,
  onExpand,
}) => {
  const { navigate } = useNavigation();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"artifacts" | "knowledge" | "connectors">("artifacts");
  const confirm = useConfirm();
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [attachedConnectorIds, setAttachedConnectorIds] = useState<Set<string>>(new Set());
  const [connectorLoad, setConnectorLoad] = useState<{ scope: string; loading: boolean; error: string | null }>({ scope: "", loading: false, error: null });
  const [connectorVersion, setConnectorVersion] = useState(0);
  const [connectorAction, setConnectorAction] = useState<string | null>(null);
  const connectorScope = JSON.stringify([workspaceId, activeSessionId]);
  const connectorScopeRef = useRef(connectorScope);
  const isLoadingConnectors = connectorLoad.scope !== connectorScope || connectorLoad.loading;
  const visibleConnectors = connectorLoad.scope === connectorScope ? connectors : [];
  const [isUploading, setIsUploading] = useState(false);

  // Load the session's knowledge documents from the server, so the list survives reloads and session switches.
  useEffect(() => {
    let active = true;
    if (!workspaceId || !activeSessionId) {
      Promise.resolve().then(() => { if (active) setKnowledgeDocs([]); });
      return () => { active = false; };
    }
    apiListSessionKnowledge(workspaceId, activeSessionId)
      .then((documents) => { if (active) setKnowledgeDocs(documents); })
      .catch(() => { if (active) setKnowledgeDocs([]); });
    return () => { active = false; };
  }, [workspaceId, activeSessionId]);

  const handleUploadKnowledge = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!workspaceId || !activeSessionId) { toast.error("Open a discussion before adding knowledge."); return; }
    if (file.size > KNOWLEDGE_UPLOAD_MAX_BYTES) { toast.error(`"${file.name}" is larger than ${formatFileSize(KNOWLEDGE_UPLOAD_MAX_BYTES)}.`); return; }
    setIsUploading(true);
    try {
      const result = await apiUploadSessionKnowledge(workspaceId, activeSessionId, await readKnowledgeUpload(file));
      // Uploading a document with the same name replaces it.
      setKnowledgeDocs((prev) => [...prev.filter((doc) => doc.name !== result.name), { name: result.name, size: file.size }].sort((left, right) => left.name.localeCompare(right.name)));
      toast.success(result.indexed ? `Added "${result.name}" (${result.chunks} chunk${result.chunks === 1 ? "" : "s"} indexed).` : `Added "${result.name}". It is not searchable yet, but agents can still read it.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the knowledge file.");
    } finally {
      setIsUploading(false);
    }
  };

  const removeKnowledge = async (name: string) => {
    if (!workspaceId || !activeSessionId) return;
    const confirmed = await confirm({ title: "Remove knowledge", message: `Remove "${name}" from this discussion's knowledge? Agents will no longer read it.`, variant: "danger", confirmText: "Remove" });
    if (!confirmed) return;
    try {
      await apiDeleteSessionKnowledge(workspaceId, activeSessionId, name);
      setKnowledgeDocs((prev) => prev.filter((doc) => doc.name !== name));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the knowledge document.");
    }
  };

  const toggleConnector = async (connectionId: string) => {
    if (connectorAction || isLoadingConnectors || connectorLoad.error) return;
    if (!workspaceId || !activeSessionId) { toast.error("Open a discussion before attaching connectors."); return; }
    const attached = attachedConnectorIds.has(connectionId);
    const scope = connectorScope;
    setConnectorAction(connectionId);
    try {
      if (attached) {
        await apiDetachSessionConnector(workspaceId, activeSessionId, connectionId);
        if (connectorScopeRef.current !== scope) return;
        setAttachedConnectorIds((prev) => { const next = new Set(prev); next.delete(connectionId); return next; });
        toast.info("Connector detached from this discussion.");
      } else {
        await apiAttachSessionConnector(workspaceId, activeSessionId, connectionId);
        if (connectorScopeRef.current !== scope) return;
        setAttachedConnectorIds((prev) => new Set(prev).add(connectionId));
        toast.success("Connector attached to this discussion.");
      }
    } catch (error) {
      if (connectorScopeRef.current !== scope) return;
      toast.error(error instanceof Error ? error.message : "Could not update the connector.");
    } finally {
      setConnectorAction(null);
    }
  };

  // Load inventory and attachment state together; an unsuccessful request is never an empty workspace.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    connectorScopeRef.current = connectorScope;
    Promise.resolve().then(async () => {
      if (!active) return;
      setConnectorLoad({ scope: connectorScope, loading: true, error: null });
      if (!workspaceId) {
        setConnectors([]);
        setAttachedConnectorIds(new Set());
        return;
      }
      const [items, ids] = await Promise.all([
        connectorsApi.list({ workspaceId }, controller.signal),
        activeSessionId ? apiListSessionConnectors(workspaceId, activeSessionId) : Promise.resolve<string[]>([]),
      ]);
      if (active) {
        setConnectors(items);
        setAttachedConnectorIds(new Set(ids));
      }
    })
      .catch((error: unknown) => {
        if (active) setConnectorLoad({ scope: connectorScope, loading: false, error: error instanceof Error ? error.message : "Could not load discussion connectors." });
      })
      .finally(() => {
        if (active) setConnectorLoad(state => ({ ...state, loading: false }));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [workspaceId, activeSessionId, connectorScope, connectorVersion, activeTab]);

  return (
    <aside className={`${isCollapsed ? "w-16" : "w-80"} shrink-0 border-l border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md flex flex-col h-full overflow-hidden select-none transition-[width] duration-200 ease-in-out`}>
      {isCollapsed ? (
        <div className="flex flex-col h-full w-full items-center">
          {/* Top Expansion Option */}
          <div className="py-3.5 px-2 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-center w-full min-h-[57px] shrink-0">
            <button
              type="button"
              onClick={onExpand}
              aria-label="Expand session resources"
              title="Expand session resources"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          </div>

          {/* Icons for artifacts, knowledge and connectors */}
          <div className="pt-3 p-2 space-y-3 flex flex-col items-center w-full">
            <button
              type="button"
              onClick={() => {
                setActiveTab("artifacts");
                onExpand?.();
              }}
              aria-label="Artifacts"
              title="Artifacts"
              className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === "artifacts"
                  ? "bg-primary-muted text-primary shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <FileText className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("knowledge");
                onExpand?.();
              }}
              aria-label="Knowledge"
              title="Knowledge"
              className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === "knowledge"
                  ? "bg-primary-muted text-primary shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <BookOpen className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("connectors");
                onExpand?.();
              }}
              aria-label="Connectors"
              title="Connectors"
              className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                activeTab === "connectors"
                  ? "bg-primary-muted text-primary shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Plug className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <>
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
          <button type="button" onClick={onClose} aria-label="Collapse session resources" title="Collapse session resources" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
            <PanelRightClose className="h-4 w-4" />
          </button>
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
            <SessionArtifacts workspaceId={workspaceId} sessionId={activeSessionId} version={artifactsVersion} />
          </div>
        ) : activeTab === "knowledge" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Session Knowledge Base ({knowledgeDocs.length})
              </span>
              <label className={`inline-flex items-center gap-1 text-[11px] font-bold text-primary cursor-pointer ${isUploading || !activeSessionId ? "opacity-40 pointer-events-none" : "hover:underline"}`}>
                {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <UploadCloud className="h-3 w-3" />}
                <span>Upload</span>
                <input type="file" accept={KNOWLEDGE_UPLOAD_ACCEPT} className="hidden" onChange={handleUploadKnowledge} disabled={isUploading || !activeSessionId} />
              </label>
            </div>

            {knowledgeDocs.length === 0 ? (
              <div className="text-center p-6 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <BookOpen className="h-6 w-6 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="font-semibold text-slate-600 dark:text-slate-400">No knowledge indexed for this discussion</p>
                <p className="text-[11px] text-slate-400 mt-1">Upload text, Markdown, CSV, JSON or code files up to {formatFileSize(KNOWLEDGE_UPLOAD_MAX_BYTES)}. Agents search and read them when they answer.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {knowledgeDocs.map((doc) => (
                  <div
                    key={doc.name}
                    className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900 shadow-xs flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate" title={doc.name}>{doc.name}</h4>
                        <span className="text-[10px] text-slate-400 block">{formatFileSize(doc.size)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                        Indexed
                      </span>
                      <button type="button" onClick={() => void removeKnowledge(doc.name)} title="Remove" aria-label={`Remove ${doc.name}`} className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Operational Tools ({isLoadingConnectors || connectorLoad.error ? "—" : visibleConnectors.length})
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
                Agents read attached connectors when they answer. Reads are read-only, and credentials and key files are never shown to them.
              </p>
            </div>

            {isLoadingConnectors ? (
              <div className="flex items-center justify-center p-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : connectorLoad.error ? (
              <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                <p>{connectorLoad.error}</p>
                <button type="button" onClick={() => setConnectorVersion(value => value + 1)} className="font-semibold underline cursor-pointer">Try again</button>
              </div>
            ) : visibleConnectors.length === 0 ? (
              <div className="text-center p-6 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <Plug className="h-6 w-6 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="font-semibold text-slate-600 dark:text-slate-400">No configured connectors</p>
                <p className="text-[11px] text-slate-400 mt-1">No operational connectors configured for this workspace.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleConnectors.map((conn) => (
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
                          {conn.provider}
                        </span>
                        {conn.credentialError && <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">{conn.credentialError}</p>}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleConnector(conn.id)}
                      disabled={!activeSessionId || Boolean(connectorAction) || Boolean(conn.credentialError && !attachedConnectorIds.has(conn.id))}
                      title={attachedConnectorIds.has(conn.id) ? "Detach from this discussion" : "Attach to this discussion"}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${attachedConnectorIds.has(conn.id) ? "bg-primary-muted border-primary text-primary" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                    >
                      <LinkIcon className="h-3 w-3" />
                      {attachedConnectorIds.has(conn.id) ? "Attached" : "Attach"}
                    </button>
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
        </>
      )}
    </aside>
  );
};

