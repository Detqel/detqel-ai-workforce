"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FlaskConical,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import {
  type BrainApprovalItem,
  type BrainApprovalsView,
  type BrainForecastView,
  type BrainOverviewView,
  type BrainSimulationPreset,
} from "@/constants/brainConstants";
import { PrimaryButton } from "@/components/ui/primary-button";
import type { BrainPanel } from "./panels/BrainPanelHost";

interface BrainCardProps {
  onOpenPanel: (panel: BrainPanel) => void;
}

const isElevatedTier = (tier: BrainApprovalItem["riskTier"]) => tier === "High" || tier === "Critical";

export const GovernedForecastCard: React.FC<BrainCardProps & { forecast: BrainForecastView }> = ({
  forecast,
  onOpenPanel,
}) => {
  return (
    <article className="flex-1 h-full p-4 flex flex-col justify-between gap-3 min-w-0">
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Governed Forecast
          </span>
          <div className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded-md bg-primary-muted border border-primary-border text-[10px] font-semibold text-primary">
              Estimate
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-[#182234] border border-slate-200/80 dark:border-slate-700 text-[10px] font-medium text-slate-500 dark:text-slate-400">
              {forecast.modelLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-2xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-slate-100">
            {forecast.value}
          </span>
          {forecast.deltaLabel && (
            <span
              className={`text-xs font-semibold tabular-nums ${
                forecast.isNegative
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {forecast.deltaLabel}
            </span>
          )}
          {forecast.uncertaintyLabel && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {forecast.uncertaintyLabel}
            </span>
          )}
        </div>

        <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate">
          {forecast.metricLabel}
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          <span>
            Observed baseline:{" "}
            <strong className="font-semibold text-slate-700 dark:text-slate-200">{forecast.baselineValue}</strong>
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" aria-hidden="true" />
            {forecast.freshnessLabel}
          </span>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => onOpenPanel({ kind: "forecasting" })}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring rounded-md"
        >
          <span>View forecast runs</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
};

export const WhatIfSimulationCard: React.FC<BrainCardProps & { presets: BrainSimulationPreset[] }> = ({
  presets,
  onOpenPanel,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // Saved scenarios change as the overview refreshes; fall back to the first one when the selection disappears.
  const activePreset = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0];

  if (!activePreset) {
    return (
      <article className="flex-1 h-full p-4 flex flex-col justify-between gap-3 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 inline-flex items-center gap-1">
          <FlaskConical className="w-3 h-3" aria-hidden="true" />
          What-If Simulation
        </span>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
          No saved scenarios yet. Ask the assistant in the chat for a what-if analysis and save it to compare it here.
        </p>
        <div className="flex justify-end pt-1">
          <PrimaryButton
            onClick={() => onOpenPanel({ kind: "simulations" })}
            value="View simulations"
            icon={<ArrowRight className="w-3 h-3" />}
            className="px-3 py-1.5 text-[11px] shrink-0"
          />
        </div>
      </article>
    );
  }

  return (
    <article className="flex-1 h-full p-4 flex flex-col justify-between gap-3 min-w-0">
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 inline-flex items-center gap-1">
            <FlaskConical className="w-3 h-3" aria-hidden="true" />
            What-If Simulation
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-900/60 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
            Assumption
          </span>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label="Simulation scenario preset"
        >
          {presets.map((preset) => {
            const isSelected = preset.id === activePreset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedPresetId(preset.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-primary-muted border-primary text-primary"
                    : "bg-white dark:bg-[#182234] border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-border"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-lg bg-white dark:bg-[#182234] border border-slate-200/80 dark:border-slate-800 px-3 py-2 space-y-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {activePreset.projectedValue}
            </span>
            <span
              className={`text-[11px] font-semibold tabular-nums ${
                activePreset.deltaLabel.startsWith("-")
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {activePreset.deltaLabel}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {activePreset.assumption}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
          {activePreset.confidenceLabel}
        </span>
        <PrimaryButton
          onClick={() => onOpenPanel({ kind: "simulations" })}
          value="View runs"
          icon={<ArrowRight className="w-3 h-3" />}
          className="px-3 py-1.5 text-[11px] shrink-0"
        />
      </div>
    </article>
  );
};

export const DataOntologyHealthCard: React.FC<BrainCardProps & { health: BrainOverviewView["health"] }> = ({
  health,
  onOpenPanel,
}) => {
  return (
    <article className="flex-1 h-full p-4 flex flex-col justify-between gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          Data &amp; Ontology Health
        </span>
        <button
          type="button"
          onClick={() => onOpenPanel({ kind: "lineage" })}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-hover cursor-pointer"
        >
          <span>Inspect</span>
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>

      <div className="overflow-x-auto -mx-1 px-1 flex-1">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-slate-200/80 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <th className="py-1.5 pr-2 font-semibold">Domain</th>
              <th className="py-1.5 px-2 font-semibold">Zone</th>
              <th className="py-1.5 px-2 font-semibold text-right">Quality</th>
              <th className="py-1.5 pl-2 font-semibold text-right">Freshness</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/80">
            {health.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-[11px] text-slate-500 dark:text-slate-400">
                  No datasets yet. Register a dataset on a connection to start the Medallion pipeline.
                </td>
              </tr>
            )}
            {health.map((row) => (
              <tr
                key={row.id}
                onClick={() => onOpenPanel({ kind: "lineage", datasetId: row.id })}
                className="hover:bg-white dark:hover:bg-[#182234] transition-colors cursor-pointer group"
              >
                <td className="py-2 pr-2 min-w-0">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenPanel({ kind: "lineage", datasetId: row.id });
                    }}
                    className="text-left focus-visible:outline-none focus-visible:underline focus-visible:text-primary cursor-pointer"
                  >
                    <span className="block font-semibold text-slate-800 dark:text-slate-100 group-hover:text-primary transition-colors">
                      {row.domain}
                    </span>
                    <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                      {row.entities}
                    </span>
                  </button>
                </td>
                <td className="py-2 px-2 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      row.zone === "Gold"
                        ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                        : "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {row.zone}
                  </span>
                </td>
                <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {row.quality}
                  </span>
                  {row.quarantineNote && (
                    <span className="block text-[9px] font-medium text-amber-600 dark:text-amber-400">
                      {row.quarantineNote}
                    </span>
                  )}
                </td>
                <td className="py-2 pl-2 text-right tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {row.freshness}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
};

export const WorkforceApprovalsCard: React.FC<BrainCardProps & { approvals: BrainApprovalsView }> = ({
  approvals,
  onOpenPanel,
}) => {
  return (
    <article className="flex-1 h-full p-4 flex flex-col justify-between gap-3 min-w-0">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-primary" aria-hidden="true" />
            Workforce &amp; Approvals
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
            {approvals.verifiedToday} verified today
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {approvals.pendingCount} Pending
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            human-in-the-loop gates
          </span>
        </div>

        <div className="space-y-2">
          {approvals.items.length === 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Nothing is waiting for a decision.
            </p>
          )}
          {approvals.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenPanel({ kind: "approvals" })}
              className="w-full rounded-xl bg-white dark:bg-[#182234] border border-slate-200/80 dark:border-slate-800 hover:border-primary-border p-2.5 text-left transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-primary transition-colors truncate">
                  {item.title}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${
                    isElevatedTier(item.riskTier)
                      ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-900/60"
                      : "bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200/80 dark:border-blue-900/60"
                  }`}
                >
                  {isElevatedTier(item.riskTier) ? (
                    <ShieldAlert className="w-2.5 h-2.5" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" />
                  )}
                  {item.riskTier}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="truncate">{item.reference}</span>
                <span className="truncate">{item.detail}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => onOpenPanel({ kind: "approvals" })}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring rounded-md"
        >
          <span>Review approval queue</span>
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </article>
  );
};
