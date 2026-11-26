"use client";

import React from "react";
import { AlertCircle, Loader2 } from "lucide-react";

export const inputClass =
  "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131c2d] px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-ring disabled:opacity-60";

export const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

export const percentLabel = (rate: number | null | undefined) => (rate === null || rate === undefined ? "—" : `${Math.round(rate * 1000) / 10}%`);

/** Loading, error and empty states for a panel section, so each panel only renders its data. */
export const PanelState: React.FC<{ loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string; children?: React.ReactNode }> = ({
  loading,
  error,
  empty,
  emptyText = "Nothing to show yet.",
  children,
}) => {
  if (error) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{error}</span>
      </p>
    );
  }
  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 justify-center text-xs text-slate-500 dark:text-slate-400" role="status">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        Loading…
      </p>
    );
  }
  if (empty) return <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">{emptyText}</p>;
  return <>{children}</>;
};

const PILL_TONES = {
  emerald: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400",
  red: "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400",
  blue: "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400",
  slate: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
  primary: "bg-primary-muted text-primary",
} as const;
export type PillTone = keyof typeof PILL_TONES;

export const Pill: React.FC<{ tone?: PillTone; children: React.ReactNode }> = ({ tone = "slate", children }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${PILL_TONES[tone]}`}>{children}</span>
);

/** Colour for a dataset or pipeline status. */
export const statusTone = (status: string | null | undefined): PillTone => {
  if (status === "succeeded" || status === "active" || status === "approved" || status === "gold" || status === "connected") return "emerald";
  if (status === "failed" || status === "error" || status === "revoked" || status === "rejected") return "red";
  if (status === "partial" || status === "paused" || status === "proposed" || status === "silver") return "amber";
  if (status === "running") return "blue";
  return "slate";
};

export const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="flex items-center justify-between gap-2 mb-2">
    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{children}</h3>
    {action}
  </div>
);

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block space-y-1">
    <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">{label}</span>
    {children}
    {hint && <span className="block text-[10px] text-slate-400 dark:text-slate-500">{hint}</span>}
  </label>
);

export const Tabs = <T extends string>({ tabs, active, onChange }: { tabs: Array<{ id: T; label: string }>; active: T; onChange: (id: T) => void }) => (
  <div role="tablist" className="flex gap-1 px-6 pt-3 border-b border-slate-100 dark:border-slate-800">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={tab.id === active}
        onClick={() => onChange(tab.id)}
        className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
          tab.id === active
            ? "border-primary text-primary"
            : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);
