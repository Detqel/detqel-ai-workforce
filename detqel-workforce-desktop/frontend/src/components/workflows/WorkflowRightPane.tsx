"use client";

import React, { useState } from "react";
import {
  Play,
  Square,
  Terminal,
  FileCode,
  Download,
  Copy,
  Check,
  Trash2,
  Sliders,
  Activity,
  Layers,
  ChevronRight,
  ExternalLink,
  Info,
  Clock,
  Sparkles,
  Database,
  ArrowRight,
  X,
} from "lucide-react";
import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowLog,
  WorkflowRunResult,
} from "@/types/workflow";

interface WorkflowRightPaneProps {
  isOpen: boolean;
  onToggle: () => void;
  workflowName: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNode: WorkflowNode | null;
  onUpdateSelectedNodeConfig: (config: Record<string, any>) => void;
  onDeselectNode: () => void;
  isExecuting: boolean;
  onRunWorkflow: () => void;
  onStopWorkflow: () => void;
  logs: WorkflowLog[];
  onClearLogs: () => void;
  runResult: WorkflowRunResult | null;
}

export const WorkflowRightPane: React.FC<WorkflowRightPaneProps> = ({
  isOpen,
  onToggle,
  workflowName,
  nodes,
  edges,
  selectedNode,
  onUpdateSelectedNodeConfig,
  onDeselectNode,
  isExecuting,
  onRunWorkflow,
  onStopWorkflow,
  logs,
  onClearLogs,
  runResult,
}) => {
  const [activeTab, setActiveTab] = useState<"execute" | "logs" | "results" | "export">("execute");
  const [inputPayload, setInputPayload] = useState<string>(
    JSON.stringify({ env: "production", triggerBy: "user", payload: {} }, null, 2)
  );
  const [copiedType, setCopiedType] = useState<string | null>(null);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Open Workflow Panel"
        className="absolute top-20 right-4 z-20 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-md text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-primary transition-all cursor-pointer"
      >
        <Activity className="h-4 w-4 text-primary" />
        <span>Execution Panel</span>
      </button>
    );
  }

  // Handle export functions
  const handleDownloadJSON = () => {
    const spec = {
      name: workflowName,
      exportedAt: new Date().toISOString(),
      nodes,
      edges,
    };
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflowName.toLowerCase().replaceAll(/\s+/g, "_")}_workflow.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadYAML = () => {
    // Clean YAML export format
    const lines = [
      `name: "${workflowName}"`,
      `exportedAt: "${new Date().toISOString()}"`,
      `nodes:`,
      ...nodes.map(
        (n) =>
          `  - id: "${n.id}"\n    type: "${n.type}"\n    title: "${n.title}"\n    category: "${n.category}"\n    position: { x: ${n.position.x}, y: ${n.position.y} }`
      ),
      `edges:`,
      ...edges.map(
        (e) =>
          `  - id: "${e.id}"\n    source: "${e.sourceNodeId}"\n    target: "${e.targetNodeId}"`
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflowName.toLowerCase().replaceAll(/\s+/g, "_")}_workflow.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadResults = () => {
    if (!runResult) return;
    const blob = new Blob([JSON.stringify(runResult, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run_results_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySpec = (type: string) => {
    const spec = {
      name: workflowName,
      exportedAt: new Date().toISOString(),
      nodes,
      edges,
    };
    navigator.clipboard.writeText(JSON.stringify(spec, null, 2));
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  return (
    <aside className="w-88 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-col h-full z-20 shadow-lg">
      {/* Panel Header */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
            <Activity className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Run &amp; Output Hub
            </h3>
            <p className="text-[10px] text-slate-400">
              {nodes.length} nodes &bull; {edges.length} connections
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          title="Collapse Panel"
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs Bar */}
      <div className="grid grid-cols-4 p-1.5 gap-1 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-[11px] font-medium text-slate-500">
        <button
          type="button"
          onClick={() => setActiveTab("execute")}
          className={`py-1.5 px-1 rounded-lg text-center transition-all cursor-pointer ${
            activeTab === "execute"
              ? "bg-white dark:bg-slate-800 text-primary font-bold shadow-xs"
              : "hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          Execute
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`relative py-1.5 px-1 rounded-lg text-center transition-all cursor-pointer ${
            activeTab === "logs"
              ? "bg-white dark:bg-slate-800 text-primary font-bold shadow-xs"
              : "hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          <span>Logs</span>
          {logs.length > 0 && (
            <span className="ml-1 px-1 py-0.2 rounded-full text-[9px] bg-primary/20 text-primary font-bold">
              {logs.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("results")}
          className={`py-1.5 px-1 rounded-lg text-center transition-all cursor-pointer ${
            activeTab === "results"
              ? "bg-white dark:bg-slate-800 text-primary font-bold shadow-xs"
              : "hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          Results
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("export")}
          className={`py-1.5 px-1 rounded-lg text-center transition-all cursor-pointer ${
            activeTab === "export"
              ? "bg-white dark:bg-slate-800 text-primary font-bold shadow-xs"
              : "hover:text-slate-900 dark:hover:text-slate-100"
          }`}
        >
          Export
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* EXECUTION TAB */}
        {activeTab === "execute" && (
          <div className="space-y-4">
            {/* Primary Run Trigger */}
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Pipeline Status
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    isExecuting
                      ? "bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse"
                      : runResult?.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : runResult?.status === "failed"
                      ? "bg-red-500/10 text-red-500 border border-red-500/20"
                      : "bg-slate-200/60 dark:bg-slate-800 text-slate-500"
                  }`}
                >
                  {isExecuting ? "Executing" : runResult?.status || "Idle"}
                </span>
              </div>

              {isExecuting ? (
                <button
                  type="button"
                  onClick={onStopWorkflow}
                  className="w-full py-2.5 rounded-xl bg-red-500 text-white font-semibold text-xs flex items-center justify-center gap-2 hover:bg-red-600 transition-colors shadow-sm cursor-pointer"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>Abort Execution</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRunWorkflow}
                  disabled={nodes.length === 0}
                  className={`w-full py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm ${
                    nodes.length === 0
                      ? "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                      : "bg-primary text-primary-foreground hover:opacity-90 active:scale-98 cursor-pointer"
                  }`}
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Execute Workflow Pipeline</span>
                </button>
              )}

              {nodes.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center">
                  Add at least one node to canvas to enable execution.
                </p>
              )}
            </div>

            {/* Selected Node Configuration Inspector */}
            {selectedNode ? (
              <div className="p-3.5 rounded-2xl border border-primary/30 bg-primary/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Step Config: {selectedNode.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onDeselectNode}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1 uppercase tracking-wider">
                      Node ID &amp; Type
                    </label>
                    <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      {selectedNode.id} &bull; {selectedNode.type}
                    </div>
                  </div>

                  {/* Config fields dynamically rendered based on type */}
                  {selectedNode.type === "api-call" && (
                    <>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                          HTTP Method
                        </label>
                        <select
                          value={selectedNode.config?.method || "GET"}
                          onChange={(e) =>
                            onUpdateSelectedNodeConfig({
                              ...selectedNode.config,
                              method: e.target.value,
                            })
                          }
                          className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                          <option value="DELETE">DELETE</option>
                          <option value="PATCH">PATCH</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                          Endpoint URL
                        </label>
                        <input
                          type="text"
                          value={selectedNode.config?.url || ""}
                          onChange={(e) =>
                            onUpdateSelectedNodeConfig({
                              ...selectedNode.config,
                              url: e.target.value,
                            })
                          }
                          placeholder="https://api.example.com/endpoint"
                          className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                        />
                      </div>
                    </>
                  )}

                  {selectedNode.type === "schedule-trigger" && (
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                        Cron Schedule Expression
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config?.cron || "0 * * * *"}
                        onChange={(e) =>
                          onUpdateSelectedNodeConfig({
                            ...selectedNode.config,
                            cron: e.target.value,
                          })
                        }
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                      />
                    </div>
                  )}

                  {selectedNode.type === "wait-delay" && (
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                        Delay Duration (Seconds)
                      </label>
                      <input
                        type="number"
                        value={selectedNode.config?.durationSeconds || 5}
                        onChange={(e) =>
                          onUpdateSelectedNodeConfig({
                            ...selectedNode.config,
                            durationSeconds: Number(e.target.value),
                          })
                        }
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                      />
                    </div>
                  )}

                  {selectedNode.type === "condition-branch" && (
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                        Evaluation Rule / Expression
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config?.expression || "payload.status == 200"}
                        onChange={(e) =>
                          onUpdateSelectedNodeConfig({
                            ...selectedNode.config,
                            expression: e.target.value,
                          })
                        }
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                      />
                    </div>
                  )}

                  {selectedNode.type === "agent-task" && (
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                        Agent Role Directive
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config?.agentRole || "Senior Code Reviewer"}
                        onChange={(e) =>
                          onUpdateSelectedNodeConfig({
                            ...selectedNode.config,
                            agentRole: e.target.value,
                          })
                        }
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                <Sliders className="h-5 w-5 mx-auto text-slate-400 mb-1" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Node Inspector
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Click any node on the canvas to inspect and configure parameters.
                </p>
              </div>
            )}

            {/* Input Payload Editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Trigger Input Payload (JSON)
                </label>
                <span className="text-[10px] text-slate-400">Mock params</span>
              </div>
              <textarea
                rows={5}
                value={inputPayload}
                onChange={(e) => setInputPayload(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === "logs" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Live Execution Stream
              </span>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={onClearLogs}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {logs.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <Terminal className="h-6 w-6 mx-auto text-slate-400 mb-2 stroke-[1.5]" />
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  No Execution Logs
                </h4>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Execution logs are streamed here once you trigger a workflow run.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {logs.map((log) => {
                  const badgeColor =
                    log.level === "success"
                      ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
                      : log.level === "error"
                      ? "text-red-500 bg-red-500/10 border-red-500/20"
                      : log.level === "warn"
                      ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
                      : "text-cyan-500 bg-cyan-500/10 border-cyan-500/20";

                  return (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-mono text-slate-400">{log.timestamp}</span>
                        <span
                          className={`font-bold px-1.5 py-0.2 rounded border uppercase text-[9px] ${badgeColor}`}
                        >
                          {log.level}
                        </span>
                      </div>
                      {log.nodeTitle && (
                        <div className="font-semibold text-[11px] text-slate-800 dark:text-slate-200">
                          {log.nodeTitle}
                        </div>
                      )}
                      <p className="text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                        {log.message}
                      </p>
                      {log.data && (
                        <pre className="p-1.5 rounded bg-slate-100 dark:bg-slate-900 font-mono text-[10px] text-slate-500 dark:text-slate-400 overflow-x-auto">
                          {typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* RESULTS TAB */}
        {activeTab === "results" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Pipeline Output
              </span>
              {runResult && (
                <button
                  type="button"
                  onClick={handleDownloadResults}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
                >
                  <Download className="h-3 w-3" />
                  <span>Download</span>
                </button>
              )}
            </div>

            {!runResult ? (
              <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                <FileCode className="h-6 w-6 mx-auto text-slate-400 mb-2 stroke-[1.5]" />
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  No Execution Results
                </h4>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Run the workflow pipeline to inspect computed responses and step outputs.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Duration</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      {runResult.durationMs ?? 0} ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Completed Steps</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      {nodes.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Status</span>
                    <span className="font-mono font-bold text-emerald-500 uppercase">
                      {runResult.status}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 block mb-1 uppercase tracking-wider">
                    Output Response Payload
                  </label>
                  <pre className="p-3 rounded-xl bg-slate-900 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-[300px]">
                    {JSON.stringify(runResult.output ?? { status: "success", executedNodes: nodes.length }, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* EXPORT TAB */}
        {activeTab === "export" && (
          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
              Export Workflow Specifications
            </span>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleDownloadJSON}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/50 dark:hover:border-primary/50 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center border border-cyan-500/20">
                    <FileCode className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Export JSON Spec
                    </h5>
                    <p className="text-[10px] text-slate-400">
                      Download complete definition as .json
                    </p>
                  </div>
                </div>
                <Download className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={handleDownloadYAML}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/50 dark:hover:border-primary/50 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center border border-purple-500/20">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Export YAML Spec
                    </h5>
                    <p className="text-[10px] text-slate-400">
                      Download pipeline configuration as .yaml
                    </p>
                  </div>
                </div>
                <Download className="h-4 w-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => handleCopySpec("spec")}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/50 dark:hover:border-primary/50 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer text-left"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
                    <Copy className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Copy Spec to Clipboard
                    </h5>
                    <p className="text-[10px] text-slate-400">
                      {copiedType === "spec" ? "Copied to clipboard!" : "Copy JSON structure"}
                    </p>
                  </div>
                </div>
                {copiedType === "spec" ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4 text-slate-400" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

