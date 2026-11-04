"use client";

import React from "react";
import {
  Trash2,
  Settings,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";
import type { WorkflowNode } from "@/types/workflow";
import { getIconComponent } from "./WorkflowPalette";

const CATEGORY_COLORS: Record<string, { border: string; bg: string; iconBg: string; text: string }> = {
  trigger: {
    border: "border-amber-500/40 dark:border-amber-500/40",
    bg: "bg-amber-500/5 dark:bg-amber-500/10",
    iconBg: "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
  },
  action: {
    border: "border-cyan-500/40 dark:border-cyan-500/40",
    bg: "bg-cyan-500/5 dark:bg-cyan-500/10",
    iconBg: "bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
    text: "text-cyan-600 dark:text-cyan-400",
  },
  flow: {
    border: "border-purple-500/40 dark:border-purple-500/40",
    bg: "bg-purple-500/5 dark:bg-purple-500/10",
    iconBg: "bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
    text: "text-purple-600 dark:text-purple-400",
  },
  agent: {
    border: "border-emerald-500/40 dark:border-emerald-500/40",
    bg: "bg-emerald-500/5 dark:bg-emerald-500/10",
    iconBg: "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  output: {
    border: "border-rose-500/40 dark:border-rose-500/40",
    bg: "bg-rose-500/5 dark:bg-rose-500/10",
    iconBg: "bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30",
    text: "text-rose-600 dark:text-rose-400",
  },
};

interface WorkflowNodeItemProps {
  node: WorkflowNode;
  isSelected: boolean;
  onSelect: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  onStartConnect: (e: React.MouseEvent, nodeId: string, handle: string) => void;
  onEndConnect?: (nodeId: string, handle: string) => void;
}

export const WorkflowNodeItem: React.FC<WorkflowNodeItemProps> = ({
  node,
  isSelected,
  onSelect,
  onDelete,
  onMouseDown,
  onStartConnect,
  onEndConnect,
}) => {
  const styles = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.action;
  const Icon = getIconComponent(
    node.category === "trigger"
      ? "Zap"
      : node.category === "flow"
      ? "GitBranch"
      : node.category === "agent"
      ? "Bot"
      : node.category === "output"
      ? "Send"
      : "Globe"
  );

  const getSubtitle = () => {
    if (node.subtitle) return node.subtitle;
    if (node.config?.method && node.config?.url) {
      return `${node.config.method} ${node.config.url}`;
    }
    if (node.config?.cron) {
      return `Cron: ${node.config.cron}`;
    }
    if (node.config?.durationSeconds) {
      return `Wait: ${node.config.durationSeconds}s`;
    }
    if (node.config?.expression) {
      return `If: ${node.config.expression}`;
    }
    if (node.config?.agentRole) {
      return `Role: ${node.config.agentRole}`;
    }
    return node.type.replaceAll("-", " ");
  };

  return (
    <div
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      className={`absolute w-64 rounded-2xl border backdrop-blur-md transition-shadow select-none cursor-move ${
        isSelected
          ? "border-primary ring-2 ring-primary/40 shadow-lg shadow-primary/10 z-20"
          : `${styles.border} shadow-sm hover:shadow-md z-10`
      } bg-white/95 dark:bg-slate-900/95`}
    >
      {/* Input Handle Port (Top) - omitted for trigger nodes */}
      {node.category !== "trigger" && (
        <div
          onMouseUp={(e) => {
            e.stopPropagation();
            onEndConnect?.(node.id, "input");
          }}
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center justify-center group/port cursor-crosshair"
          title="Connect input"
        >
          <div className="h-4 w-4 rounded-full border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover/port:scale-125 group-hover/port:border-primary transition-all flex items-center justify-center shadow-xs">
            <div className="h-1.5 w-1.5 rounded-full bg-slate-400 group-hover/port:bg-primary transition-colors" />
          </div>
        </div>
      )}

      {/* Node Header Card */}
      <div
        onMouseDown={(e) => onMouseDown(e, node.id)}
        className="p-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${styles.iconBg} shadow-2xs`}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
              {node.title}
            </h3>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block truncate">
              {node.category}
            </span>
          </div>
        </div>

        {/* Status & Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {node.status === "running" && (
            <span title="Running">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            </span>
          )}
          {node.status === "success" && (
            <span title="Success">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </span>
          )}
          {node.status === "error" && (
            <span title="Error">
              <AlertCircle className="h-3.5 w-3.5 text-red-500" />
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            title="Delete node"
            className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Node Body Details */}
      <div className="p-3 space-y-2">
        <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 truncate bg-slate-50 dark:bg-slate-950/60 p-1.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
          {getSubtitle()}
        </div>

        {node.config?.timeoutMs && (
          <div className="flex items-center gap-1 text-[10px] text-slate-400">
            <Clock className="h-3 w-3" />
            <span>Timeout: {node.config.timeoutMs / 1000}s</span>
          </div>
        )}
      </div>

      {/* Output Handle Port (Bottom) - omitted for terminal output nodes */}
      {node.type !== "webhook-response" && (
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            onStartConnect(e, node.id, "output");
          }}
          className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex items-center justify-center group/port cursor-crosshair"
          title="Drag to connect next step"
        >
          <div className="h-4 w-4 rounded-full border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover/port:scale-125 group-hover/port:border-primary transition-all flex items-center justify-center shadow-xs">
            <div className="h-1.5 w-1.5 rounded-full bg-slate-400 group-hover/port:bg-primary transition-colors" />
          </div>
        </div>
      )}
    </div>
  );
};

