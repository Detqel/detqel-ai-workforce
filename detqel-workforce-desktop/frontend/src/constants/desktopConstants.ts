import type { ComponentType } from "react";
import { DockerIcon, Postgresql } from "@dev.icons/react";
import { Boxes, CheckCircle2, Circle, Loader2, Monitor, Route, Server, XCircle } from "lucide-react";
import { APPLICATION_NAME } from "./commonConstants";

export const DESKTOP_STATUS_POLL_INTERVAL_MS = 1000;
export const DESKTOP_RUNTIME_CONTACT_ERROR = `Unable to contact the desktop runtime. Restart ${APPLICATION_NAME}.`;
export const DESKTOP_FRONTEND_READY_ERROR = "Unable to report frontend readiness to the desktop runtime.";
export const DESKTOP_STARTUP_RESTART_MESSAGE = `Resolve the issue above, then restart ${APPLICATION_NAME}.`;

export const DESKTOP_COMMANDS = {
  apiRequest: "api_request",
  backendStatus: "backend_status",
  frontendReady: "frontend_ready",
} as const;

type ServiceIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export const STARTUP_SERVICE_ICONS = new Map<string, ServiceIcon>([
  ["frontend-startup", Monitor],
  ["backend-startup", Server],
  ["docker", DockerIcon],
  ["litellm-database", Postgresql],
  ["milvus", Boxes],
  ["litellm", Route],
  ["application-database", Postgresql],
  ["backend-api", Server],
]);

export const STARTUP_STEP_PRESENTATION = {
  pending: { label: "Waiting", Icon: Circle, className: "text-slate-400 dark:text-slate-500" },
  running: { label: "In progress", Icon: Loader2, className: "text-[#8a2be2] dark:text-[#FFA500]" },
  complete: { label: "Ready", Icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  error: { label: "Failed", Icon: XCircle, className: "text-red-600 dark:text-red-400" },
};
