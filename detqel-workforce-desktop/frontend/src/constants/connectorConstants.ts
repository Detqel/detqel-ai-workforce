import type { ConnectorAccess, ConnectorStatus } from "@/lib/api/connectors";

export const CONNECTOR_STATUS_STYLES: Record<ConnectorStatus, string> = {
  connected: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
  pending: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  disconnected: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  error: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
};

export const CONNECTION_FIELD_MAX_LENGTH = 255;
export const CONNECTION_TABLE_COLUMNS = ["Connection Name", "Type", "Access", "Status", "Data Stream", "Last Verified", "Actions"];
export const CONNECTION_ACCESS_LABELS: Record<ConnectorAccess, string> = {
  "read-only": "Read only",
  "verification-only": "Verification only",
};
export const CONNECTION_ACCESS_STYLES: Record<ConnectorAccess, string> = {
  "read-only": "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
  "verification-only": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};
export const BOOLEAN_CONFIGURATION_OPTIONS = [{ value: "true", label: "Yes" }, { value: "false", label: "No" }];
