import { CONNECTION_ACCESS_LABELS, CONNECTION_ACCESS_STYLES, CONNECTION_TABLE_COLUMNS, CONNECTOR_STATUS_STYLES } from "@/constants/connectorConstants";
import React from "react";
import { Loader2, Pencil, Plug, PlugZap, Power, Trash2 } from "lucide-react";
import { IconOnlyButton } from "@/components/ui/icon-only-button";
import type { ConnectorRecord } from "@/lib/api/connectors";

export type ConnectorItem = ConnectorRecord;

export interface ConnectorTableProps {
  connectors?: ConnectorItem[];
  loading?: boolean;
  loadError?: string | null;
  actionId?: string | null;
  onEdit?: (connector: ConnectorItem) => void;
  onDelete?: (connector: ConnectorItem) => void;
  onReconnect?: (connector: ConnectorItem) => void;
  onDisconnect?: (connector: ConnectorItem) => void;
}

export function ConnectorTable({ connectors = [], loading, loadError, actionId, onEdit, onDelete, onReconnect, onDisconnect }: ConnectorTableProps) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#182234]">
      <div className="overflow-x-auto">
        <table aria-busy={loading} className="w-full min-w-[960px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-[#131c2d] dark:text-slate-400">
              {CONNECTION_TABLE_COLUMNS.map(column => (
                <th key={column} scope="col" title={column === "Access" ? "Agent access through KIN. Permissions granted to provider credentials may differ." : undefined} className={"whitespace-nowrap px-6 py-3.5 " + (column === "Actions" ? "text-right" : "")}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {loading ? (
              <tr><td colSpan={CONNECTION_TABLE_COLUMNS.length} className="px-6 py-16 text-center text-slate-500 dark:text-slate-400"><span role="status" className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading connections…</span></td></tr>
            ) : connectors.length ? connectors.map(item => (
              <tr key={item.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-[#1c273c]">
                <td className="px-6 py-4"><span className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</span>{item.credentialError && <p className="mt-1 max-w-sm text-[11px] text-red-600 dark:text-red-400">{item.credentialError}</p>}</td>
                <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{item.provider}</td>
                <td className="whitespace-nowrap px-6 py-4"><span className={"inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold " + CONNECTION_ACCESS_STYLES[item.access]}>{CONNECTION_ACCESS_LABELS[item.access]}</span></td>
                <td className="px-6 py-4"><span className={"inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize " + CONNECTOR_STATUS_STYLES[item.status]}>{item.status}</span></td>
                <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{item.dataStream || "—"}</td>
                <td className="whitespace-nowrap px-6 py-4 text-slate-500 dark:text-slate-400">{item.verifiedAt ? new Date(item.verifiedAt).toLocaleString() : "Not verified"}</td>
                <td className="px-6 py-4"><div className="flex justify-end gap-1">
                  {actionId === item.id && <span role="status" aria-label="Updating connection" className="flex items-center px-2 text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /></span>}
                  {!item.credentialError && item.status !== "connected" && onReconnect && <IconOnlyButton icon={<PlugZap className="h-3.5 w-3.5" />} aria-label={"Reconnect " + item.name} onClick={() => onReconnect(item)} disabled={Boolean(actionId)} />}
                  {item.status === "connected" && onDisconnect && <IconOnlyButton icon={<Power className="h-3.5 w-3.5" />} aria-label={"Disconnect " + item.name} onClick={() => onDisconnect(item)} disabled={Boolean(actionId)} />}
                  {onEdit && <IconOnlyButton icon={<Pencil className="h-3.5 w-3.5" />} aria-label={"Edit " + item.name} onClick={() => onEdit(item)} disabled={Boolean(actionId)} />}
                  {onDelete && <IconOnlyButton icon={<Trash2 className="h-3.5 w-3.5" />} aria-label={"Delete " + item.name} onClick={() => onDelete(item)} disabled={Boolean(actionId)} className="hover:text-red-600 dark:hover:text-red-400" />}
                </div></td>
              </tr>
            )) : loadError ? (
              <tr><td colSpan={CONNECTION_TABLE_COLUMNS.length} className="px-6 py-16 text-center text-slate-500 dark:text-slate-400">Connections could not be loaded. Use Try again above to reload them.</td></tr>
            ) : (
              <tr><td colSpan={CONNECTION_TABLE_COLUMNS.length} className="px-6 py-16 text-center"><div className="flex flex-col items-center justify-center space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-[#151f32] dark:text-[#FFA500]/80"><Plug className="h-6 w-6" /></div>
                <div><div className="text-sm font-bold text-slate-900 dark:text-slate-100">No connections yet</div><p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">Add a connection to bring your data, tools, and services into this workspace.</p></div>
              </div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ConnectorTable;

