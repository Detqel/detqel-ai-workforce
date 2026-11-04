"use client";

import React, { useState } from "react";
import {
  Workflow,
  Play,
  Square,
  Trash2,
  Sliders,
  PanelRightClose,
  PanelRightOpen,
  Edit2,
  Check,
  RotateCcw,
} from "lucide-react";

interface WorkflowHeaderProps {
  workflowName: string;
  onUpdateWorkflowName: (name: string) => void;
  nodeCount: number;
  edgeCount: number;
  isExecuting: boolean;
  onRunWorkflow: () => void;
  onStopWorkflow: () => void;
  onClearCanvas: () => void;
  isRightPaneOpen: boolean;
  onToggleRightPane: () => void;
}

export const WorkflowHeader: React.FC<WorkflowHeaderProps> = ({
  workflowName,
  onUpdateWorkflowName,
  nodeCount,
  edgeCount,
  isExecuting,
  onRunWorkflow,
  onStopWorkflow,
  onClearCanvas,
  isRightPaneOpen,
  onToggleRightPane,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(workflowName);

  const handleSaveName = () => {
    if (nameInput.trim()) {
      onUpdateWorkflowName(nameInput.trim());
    } else {
      setNameInput(workflowName);
    }
    setIsEditingName(false);
  };

  return (
    <header className="h-14 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-5 flex items-center justify-between gap-4 z-20">
      {/* Left: Workflow identity */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
          <Workflow className="h-4 w-4" />
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {isEditingName ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") {
                    setNameInput(workflowName);
                    setIsEditingName(false);
                  }
                }}
                autoFocus
                className="px-2 py-0.5 rounded-lg border border-primary bg-white dark:bg-slate-950 text-xs font-bold text-slate-900 dark:text-slate-100 outline-none"
              />
              <button
                type="button"
                onClick={handleSaveName}
                className="p-1 rounded-md text-emerald-500 hover:bg-emerald-500/10 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {workflowName}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setNameInput(workflowName);
                  setIsEditingName(true);
                }}
                title="Rename workflow"
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-primary transition-opacity cursor-pointer"
              >
                <Edit2 className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60">
              {nodeCount === 0 ? "Empty Canvas" : `${nodeCount} Nodes \u2022 ${edgeCount} Edges`}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {nodeCount > 0 && (
          <button
            type="button"
            onClick={onClearCanvas}
            title="Clear all nodes on canvas"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-red-500 hover:border-red-500/30 hover:bg-red-500/5 text-xs font-semibold transition-all cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear Canvas</span>
          </button>
        )}

        {isExecuting ? (
          <button
            type="button"
            onClick={onStopWorkflow}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-500 text-white font-semibold text-xs hover:bg-red-600 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            <span>Stop Run</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onRunWorkflow}
            disabled={nodeCount === 0}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl font-semibold text-xs transition-all shadow-xs ${
              nodeCount === 0
                ? "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:opacity-90 active:scale-95 cursor-pointer"
            }`}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Execute Workflow</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleRightPane}
          title={isRightPaneOpen ? "Hide Execution Panel" : "Show Execution Panel"}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {isRightPaneOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </button>
      </div>
    </header>
  );
};

