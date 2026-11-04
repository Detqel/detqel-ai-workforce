export type WorkflowCategory = "trigger" | "action" | "flow" | "agent" | "output";

export type WorkflowNodeType =
  // Triggers
  | "webhook-trigger"
  | "manual-trigger"
  | "schedule-trigger"
  | "event-trigger"
  // Actions
  | "api-call"
  | "script-eval"
  | "db-query"
  | "data-transform"
  // Flow Control
  | "wait-delay"
  | "timeout-gate"
  | "condition-branch"
  | "loop-iterator"
  // Agent & Workforce
  | "agent-task"
  | "squad-collab"
  | "llm-prompt"
  | "knowledge-search"
  // Output
  | "webhook-response"
  | "notification-alert"
  | "emit-event";

export interface PaletteItemDefinition {
  type: WorkflowNodeType;
  category: WorkflowCategory;
  name: string;
  description: string;
  badge?: string;
  iconName: string;
  defaultConfig: Record<string, any>;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  title: string;
  subtitle?: string;
  category: WorkflowCategory;
  position: { x: number; y: number };
  config: Record<string, any>;
  status?: "idle" | "running" | "success" | "error";
}

export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: "output" | "true" | "false";
  targetHandle?: "input";
}

export interface WorkflowLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "success" | "error";
  nodeId?: string;
  nodeTitle?: string;
  message: string;
  data?: any;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunResult {
  id: string;
  workflowId: string;
  status: "idle" | "running" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  output?: Record<string, any>;
  logs: WorkflowLog[];
}

