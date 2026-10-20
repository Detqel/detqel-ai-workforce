import React from "react";
import { Loader2, Pencil, Plug, PlugZap, Power, Trash2 } from "lucide-react";
import { IconOnlyButton } from "@/components/ui/icon-only-button";
import type { ConnectorRecord, ConnectorStatus } from "@/lib/api/connectors";
import type { LookupItem } from "@/lib/api/lookups";

export type ConnectorItem = ConnectorRecord;

export interface ConnectorTableProps {
  connectors?: ConnectorItem[];
  types?: LookupItem[];
  loading?: boolean;
  actionId?: string | null;
  onEdit?: (connector: ConnectorItem) => void;
  onDelete?: (connector: ConnectorItem) => void;
  onReconnect?: (connector: ConnectorItem) => void;
  onDisconnect?: (connector: ConnectorItem) => void;
}

const statusStyles: Record<ConnectorStatus, string> = {
  connected: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400",
  active: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  pending: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  disconnected: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  inactive: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  error: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
};

export function ConnectorTable({ connectors = [], types = [], loading, actionId, onEdit, onDelete, onReconnect, onDisconnect }: ConnectorTableProps) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#182234]">
      <div className="overflow-x-auto">
        <table aria-busy={loading} className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-[#131c2d] dark:text-slate-400">
              {["Connector Name", "Type", "Status", "Data Stream", "Last Verified", "Actions"].map(column => (
                <th key={column} scope="col" className={"px-6 py-3.5 " + (column === "Actions" ? "text-right" : "")}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-16 text-center text-slate-500 dark:text-slate-400"><span role="status" className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading connections…</span></td></tr>
            ) : connectors.length ? connectors.map(item => (
              <tr key={item.id} className="transition-colors hover:bg-slate-50/60 dark:hover:bg-[#1c273c]">
                <td className="px-6 py-4"><span className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</span><span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">{item.provider}</span></td>
                <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{types.find(type => type.code === item.connectionType)?.name ?? item.connectionType}</td>
                <td className="px-6 py-4"><span className={"inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize " + (!item.catalogId && item.status === "connected" ? statusStyles.active : statusStyles[item.status])}>{item.status === "active" || (!item.catalogId && item.status === "connected") ? "Unverified" : item.status}</span></td>
                <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{item.dataStream || "—"}</td>
                <td className="whitespace-nowrap px-6 py-4 text-slate-500 dark:text-slate-400">{item.verifiedAt ? new Date(item.verifiedAt).toLocaleString() : "Not verified"}</td>
                <td className="px-6 py-4"><div className="flex justify-end gap-1">
                  {actionId === item.id && <span role="status" aria-label="Updating connection" className="flex items-center px-2 text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /></span>}
                  {item.catalogId && item.status !== "connected" && onReconnect && <IconOnlyButton icon={<PlugZap className="h-3.5 w-3.5" />} aria-label={"Reconnect " + item.name} onClick={() => onReconnect(item)} disabled={Boolean(actionId)} />}
                  {item.catalogId && item.status === "connected" && onDisconnect && <IconOnlyButton icon={<Power className="h-3.5 w-3.5" />} aria-label={"Disconnect " + item.name} onClick={() => onDisconnect(item)} disabled={Boolean(actionId)} />}
                  {onEdit && <IconOnlyButton icon={<Pencil className="h-3.5 w-3.5" />} aria-label={"Edit " + item.name} onClick={() => onEdit(item)} disabled={Boolean(actionId)} />}
                  {onDelete && <IconOnlyButton icon={<Trash2 className="h-3.5 w-3.5" />} aria-label={"Delete " + item.name} onClick={() => onDelete(item)} disabled={Boolean(actionId)} className="hover:text-red-600 dark:hover:text-red-400" />}
                </div></td>
              </tr>
            )) : (
              <tr><td colSpan={6} className="px-6 py-16 text-center"><div className="flex flex-col items-center justify-center space-y-3">
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

