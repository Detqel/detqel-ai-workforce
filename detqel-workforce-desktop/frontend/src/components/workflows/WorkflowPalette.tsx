"use client";

import React, { useState } from "react";
import {
  Zap,
  Globe,
  Clock,
  Hourglass,
  GitBranch,
  Repeat,
  Bot,
  Users,
  Sparkles,
  Database,
  Bell,
  Send,
  Terminal,
  Search,
  Code,
  Layers,
  Sliders,
  ChevronDown,
  ChevronRight,
  Plus,
} from "lucide-react";
import type { PaletteItemDefinition, WorkflowCategory } from "@/types/workflow";

export const PALETTE_ITEMS: PaletteItemDefinition[] = [
  // Triggers
  {
    type: "manual-trigger",
    category: "trigger",
    name: "Manual Trigger",
    description: "Start workflow manually or via execution button",
    badge: "Instant",
    iconName: "Zap",
    defaultConfig: { triggerType: "manual" },
  },
  {
    type: "webhook-trigger",
    category: "trigger",
    name: "Webhook Trigger",
    description: "Receive incoming HTTP webhook requests",
    badge: "HTTP",
    iconName: "Globe",
    defaultConfig: { method: "POST", path: "/webhook/v1" },
  },
  {
    type: "schedule-trigger",
    category: "trigger",
    name: "Schedule (Cron)",
    description: "Trigger on fixed cron schedule or interval",
    badge: "Cron",
    iconName: "Clock",
    defaultConfig: { cron: "0 * * * *", timezone: "UTC" },
  },
  {
    type: "event-trigger",
    category: "trigger",
    name: "Event Trigger",
    description: "Trigger when connector or platform event occurs",
    badge: "Event",
    iconName: "Layers",
    defaultConfig: { eventName: "task.created" },
  },

  // Actions & APIs
  {
    type: "api-call",
    category: "action",
    name: "API Call",
    description: "Make HTTP REST request (GET, POST, PUT, DELETE)",
    badge: "REST",
    iconName: "Globe",
    defaultConfig: { method: "GET", url: "https://api.example.com/v1" },
  },
  {
    type: "script-eval",
    category: "action",
    name: "Code Script",
    description: "Execute JavaScript / Python logic or data transform",
    badge: "Code",
    iconName: "Code",
    defaultConfig: { language: "javascript", code: "// transform data\nreturn items;" },
  },
  {
    type: "db-query",
    category: "action",
    name: "Database Query",
    description: "Run SQL or vector query on active connectors",
    badge: "DB",
    iconName: "Database",
    defaultConfig: { query: "SELECT * FROM workspace_records LIMIT 10;" },
  },
  {
    type: "data-transform",
    category: "action",
    name: "Data Transform",
    description: "Map, filter, and restructure payload JSON schema",
    badge: "JSON",
    iconName: "Sliders",
    defaultConfig: { mapping: "{ id: input.id, output: input.value }" },
  },

  // Flow Control
  {
    type: "wait-delay",
    category: "flow",
    name: "Wait / Delay",
    description: "Pause execution for specific interval or condition",
    badge: "Delay",
    iconName: "Hourglass",
    defaultConfig: { durationSeconds: 5 },
  },
  {
    type: "timeout-gate",
    category: "flow",
    name: "Timeout Gate",
    description: "Enforce max execution duration limit boundary",
    badge: "Limit",
    iconName: "Clock",
    defaultConfig: { timeoutMs: 30000 },
  },
  {
    type: "condition-branch",
    category: "flow",
    name: "Condition (If / Else)",
    description: "Branch workflow path based on logical condition",
    badge: "Branch",
    iconName: "GitBranch",
    defaultConfig: { expression: "item.status === 'active'" },
  },
  {
    type: "loop-iterator",
    category: "flow",
    name: "Loop Iterator",
    description: "Iterate through items or batches sequentially",
    badge: "Loop",
    iconName: "Repeat",
    defaultConfig: { iteratorKey: "data.items", concurrency: 1 },
  },

  // AI & Workforce
  {
    type: "agent-task",
    category: "agent",
    name: "Agent Task",
    description: "Dispatch mandate to recruited specialist agent",
    badge: "Agent",
    iconName: "Bot",
    defaultConfig: { agentRole: "Analyst", prompt: "Synthesize operational directives" },
  },
  {
    type: "squad-collab",
    category: "agent",
    name: "Squad Directive",
    description: "Coordinate collaborative autonomous team execution",
    badge: "Squad",
    iconName: "Users",
    defaultConfig: { focus: "Cross-Functional Pod", objective: "Execute workflow mandate" },
  },
  {
    type: "llm-prompt",
    category: "agent",
    name: "LLM Prompt",
    description: "Query LLM gateway with structured schema response",
    badge: "AI",
    iconName: "Sparkles",
    defaultConfig: { model: "default", temperature: 0.2 },
  },
  {
    type: "knowledge-search",
    category: "agent",
    name: "Knowledge Search",
    description: "Semantic vector search via Milvus knowledge base",
    badge: "Vector",
    iconName: "Database",
    defaultConfig: { topK: 5, similarityThreshold: 0.75 },
  },

  // Outputs
  {
    type: "webhook-response",
    category: "output",
    name: "HTTP Response",
    description: "Return response payload and status code to caller",
    badge: "Response",
    iconName: "Send",
    defaultConfig: { statusCode: 200, body: "{ success: true }" },
  },
  {
    type: "notification-alert",
    category: "output",
    name: "Notification Alert",
    description: "Send alert via Slack, email, or webhook connector",
    badge: "Alert",
    iconName: "Bell",
    defaultConfig: { channel: "general", message: "Workflow completed successfully" },
  },
  {
    type: "emit-event",
    category: "output",
    name: "Emit Event",
    description: "Broadcast completed event to external subscribers",
    badge: "Publish",
    iconName: "Layers",
    defaultConfig: { topic: "workflow.completed" },
  },
];

const CATEGORY_METADATA: Record<
  WorkflowCategory,
  {
    label: string;
    dotColor: string;
    textColor: string;
    iconBg: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    cardBorderHover: string;
  }
> = {
  trigger: {
    label: "Triggers",
    dotColor: "bg-amber-500",
    textColor: "text-amber-500 dark:text-amber-400",
    iconBg: "bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
    badgeBg: "bg-amber-100 dark:bg-amber-950/60",
    badgeText: "text-amber-800 dark:text-amber-300",
    badgeBorder: "border-amber-300 dark:border-amber-700/60",
    cardBorderHover: "hover:border-amber-500/60 dark:hover:border-amber-500/60",
  },
  action: {
    label: "Actions & APIs",
    dotColor: "bg-cyan-500",
    textColor: "text-cyan-500 dark:text-cyan-400",
    iconBg: "bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
    badgeBg: "bg-cyan-100 dark:bg-cyan-950/60",
    badgeText: "text-cyan-800 dark:text-cyan-300",
    badgeBorder: "border-cyan-300 dark:border-cyan-700/60",
    cardBorderHover: "hover:border-cyan-500/60 dark:hover:border-cyan-500/60",
  },
  flow: {
    label: "Flow Control",
    dotColor: "bg-purple-500",
    textColor: "text-purple-500 dark:text-purple-400",
    iconBg: "bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30",
    badgeBg: "bg-purple-100 dark:bg-purple-950/60",
    badgeText: "text-purple-800 dark:text-purple-300",
    badgeBorder: "border-purple-300 dark:border-purple-700/60",
    cardBorderHover: "hover:border-purple-500/60 dark:hover:border-purple-500/60",
  },
  agent: {
    label: "AI & Workforce",
    dotColor: "bg-emerald-500",
    textColor: "text-emerald-500 dark:text-emerald-400",
    iconBg: "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    badgeBg: "bg-emerald-100 dark:bg-emerald-950/60",
    badgeText: "text-emerald-800 dark:text-emerald-300",
    badgeBorder: "border-emerald-300 dark:border-emerald-700/60",
    cardBorderHover: "hover:border-emerald-500/60 dark:hover:border-emerald-500/60",
  },
  output: {
    label: "Outputs & Alerts",
    dotColor: "bg-rose-500",
    textColor: "text-rose-500 dark:text-rose-400",
    iconBg: "bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30",
    badgeBg: "bg-rose-100 dark:bg-rose-950/60",
    badgeText: "text-rose-800 dark:text-rose-300",
    badgeBorder: "border-rose-300 dark:border-rose-700/60",
    cardBorderHover: "hover:border-rose-500/60 dark:hover:border-rose-500/60",
  },
};

export const getIconComponent = (iconName: string) => {
  switch (iconName) {
    case "Zap":
      return Zap;
    case "Globe":
      return Globe;
    case "Clock":
      return Clock;
    case "Hourglass":
      return Hourglass;
    case "GitBranch":
      return GitBranch;
    case "Repeat":
      return Repeat;
    case "Bot":
      return Bot;
    case "Users":
      return Users;
    case "Sparkles":
      return Sparkles;
    case "Database":
      return Database;
    case "Bell":
      return Bell;
    case "Send":
      return Send;
    case "Terminal":
      return Terminal;
    case "Code":
      return Code;
    case "Sliders":
      return Sliders;
    default:
      return Layers;
  }
};

export let currentDraggedItem: PaletteItemDefinition | null = null;

export const setCurrentDraggedItem = (item: PaletteItemDefinition | null) => {
  currentDraggedItem = item;
};

interface WorkflowPaletteProps {
  onAddNode: (item: PaletteItemDefinition) => void;
}

export const WorkflowPalette: React.FC<WorkflowPaletteProps> = ({ onAddNode }) => {
  const [search, setSearch] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const filteredItems = PALETTE_ITEMS.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.badge && item.badge.toLowerCase().includes(q))
    );
  });

  const categories: WorkflowCategory[] = ["trigger", "action", "flow", "agent", "output"];

  const handleDragStart = (e: React.DragEvent, item: PaletteItemDefinition) => {
    currentDraggedItem = item;
    try {
      e.dataTransfer.setData("application/workflow-node", JSON.stringify(item));
      e.dataTransfer.setData("text/plain", JSON.stringify(item));
      e.dataTransfer.effectAllowed = "all";
    } catch {
      // In-memory fallback
    }
  };

  const handleDragEnd = () => {
    currentDraggedItem = null;
  };

  return (
    <aside className="w-80 shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-950 backdrop-blur-md flex flex-col h-full overflow-hidden select-none">
      {/* Palette Top Bar */}
      <div className="p-4 border-b border-slate-200/80 dark:border-slate-800/90 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-sm">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Node Library
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Drag to canvas or click to add
              </p>
            </div>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800">
            {filteredItems.length} nodes
          </span>
        </div>

        {/* Search Field */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search functions & triggers..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* Palette Function Items List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {categories.map((cat) => {
          const catItems = filteredItems.filter((i) => i.category === cat);
          if (catItems.length === 0) return null;
          const meta = CATEGORY_METADATA[cat];
          const isCollapsed = collapsedCategories[cat];

          return (
            <div key={cat} className="space-y-1.5">
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-left text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-primary transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${meta.dotColor} shadow-xs`} />
                  <span className="group-hover:text-primary transition-colors">{meta.label}</span>
                  <span className="text-[10px] font-medium text-slate-400">
                    ({catItems.length})
                  </span>
                </div>
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-primary transition-colors" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 group-hover:text-primary transition-colors" />
                )}
              </button>

              {!isCollapsed && (
                <div className="space-y-1.5 pt-0.5">
                  {catItems.map((item) => {
                    const Icon = getIconComponent(item.iconName);

                    return (
                      <div
                        key={item.type}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onAddNode(item)}
                        className={`group flex items-start justify-between p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/90 hover:bg-slate-50 dark:hover:bg-slate-800/70 ${meta.cardBorderHover} shadow-xs hover:shadow-sm transition-all cursor-grab active:cursor-grabbing select-none`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${meta.iconBg} shadow-2xs group-hover:scale-105 transition-transform`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-primary transition-colors">
                                {item.name}
                              </h4>
                              {item.badge && (
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${meta.badgeBg} ${meta.badgeText} ${meta.badgeBorder} shrink-0`}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                              {item.description}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddNode(item);
                          }}
                          title="Add to canvas"
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-all cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-400">
            No workflow functions match &ldquo;{search}&rdquo;.
          </div>
        )}
      </div>
    </aside>
  );
};

