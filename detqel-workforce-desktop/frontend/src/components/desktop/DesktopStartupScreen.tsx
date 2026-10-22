"use client";

import { DESKTOP_STARTUP_RESTART_MESSAGE, STARTUP_SERVICE_ICONS, STARTUP_STEP_PRESENTATION } from "@/constants/desktopConstants";

import { ASSET_PATHS, APPLICATION_NAME_UPPERCASE } from "@/constants/commonConstants";

import Image from "next/image";
import { AlertCircle, Clock3, ShieldCheck } from "lucide-react";
import type { BackendStartupStep, BackendStatus } from "@/lib/desktop";

function elapsedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function StartupStep({ step }: { step: BackendStartupStep }) {
  const Icon = STARTUP_SERVICE_ICONS.get(step.id);
  const presentation = STARTUP_STEP_PRESENTATION[step.status];
  const StatusIcon = presentation.Icon;
  return (
    <li className={`flex h-full min-w-0 items-center min-h-[46px] gap-2 rounded-xl border px-3 py-2.5 transition-colors ${step.status === "running" ? "border-purple-200 bg-purple-50/80 dark:border-[#FFA500]/20 dark:bg-[#FFA500]/5" : step.status === "error" ? "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20" : "border-slate-200/80 bg-slate-50/40 dark:border-slate-700/60 dark:bg-[#131c2d]/30"}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white dark:border-slate-700/70 dark:bg-[#182234] ${step.status === "pending" ? "opacity-50" : ""}`}>{Icon && <Icon className="h-4 w-4 text-slate-600 dark:text-slate-300" aria-hidden />}</span>
      <div className="min-w-0 flex-1"><p className={`text-[11px] font-semibold ${step.status === "pending" ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100"}`}>{step.label}</p></div>
      <span className={`flex shrink-0 items-center gap-1.5 text-[9px] font-medium ${presentation.className}`}><StatusIcon aria-hidden className={`h-3.5 w-3.5 ${step.status === "running" ? "motion-safe:animate-spin" : ""}`} /><span className="hidden sm:inline">{presentation.label}</span><span className="sr-only sm:hidden">{presentation.label}</span></span>
    </li>
  );
}

interface DesktopStartupScreenProps {
  status: BackendStatus | null;
  runtimeError: string | null;
}

export function DesktopStartupScreen({ status, runtimeError }: DesktopStartupScreenProps) {
  const error = runtimeError ?? status?.error;
  const steps = status?.steps;
  const completed = steps?.filter(step => step.status === "complete").length;
  const progress = steps && steps.length > 0 && completed !== undefined ? Math.round(completed / steps.length * 100) : undefined;
  const activeStep = steps?.find(step => step.status === "running");

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 p-3 text-slate-900 dark:bg-[#0e1422] dark:text-slate-100">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8a2be2]/5 blur-3xl dark:bg-[#FFA500]/5" />
      <section aria-labelledby="desktop-startup-title" className="relative flex max-h-[calc(100dvh_-_1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-[#182234] dark:shadow-black/20">
        <header className="shrink-0 px-4 pb-3 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0"><Image src={ASSET_PATHS.nameLogoLight} alt={APPLICATION_NAME_UPPERCASE} width={160} height={32} priority className="h-8 w-40 max-w-full object-contain object-left dark:hidden" /><Image src={ASSET_PATHS.nameLogoDark} alt={APPLICATION_NAME_UPPERCASE} width={160} height={32} priority className="hidden h-8 w-40 max-w-full object-contain object-left dark:block" /></div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium tabular-nums text-slate-500 dark:border-slate-700 dark:bg-[#131c2d] dark:text-slate-400"><Clock3 aria-hidden className="h-3 w-3" /><span aria-label="Elapsed startup time">{status ? elapsedTime(status.elapsedSeconds) : "Starting"}</span></span>
          </div>
          <h1 id="desktop-startup-title" className="text-lg font-bold tracking-tight">{error ? "Startup needs your attention" : "Starting your workspace"}</h1>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{error ? "A required service could not become ready." : "Preparing your workspace services. You can begin once they are ready."}</p>
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[10px]"><span role="status" aria-live="polite" className="min-w-0 truncate font-medium text-slate-600 dark:text-slate-300">{error ? "Startup interrupted" : activeStep ? activeStep.label : "Preparing runtime"}</span>{progress !== undefined && <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{completed} / {steps?.length} ready</span>}</div>
            <div role="progressbar" aria-label="Workspace startup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-[#0e1422]">{progress === undefined ? <div className={`h-full w-full rounded-full ${error ? "bg-red-400/40" : "bg-[#8a2be2]/30 motion-safe:animate-pulse dark:bg-[#FFA500]/30"}`} /> : <div className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${error ? "bg-red-500" : "bg-[#8a2be2] dark:bg-[#FFA500]"}`} style={{ width: `${progress}%` }} />}</div>
          </div>
        </header>
        <div className="min-h-0 overflow-y-auto">
        {steps && steps.length > 0 && <ol aria-label="Workspace services" className="grid grid-cols-1 gap-2 px-3 pb-3 sm:grid-cols-2">{steps.map(step => <StartupStep key={step.id} step={step} />)}</ol>}
        {error && <div role="alert" className="mx-3 mb-3 rounded-xl border border-red-200 bg-red-50/80 p-3 dark:border-red-900/60 dark:bg-red-950/20"><p className="flex items-start gap-2 text-[11px] leading-relaxed text-red-700 dark:text-red-400"><AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{error}</span></p><p className="mt-2 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">{DESKTOP_STARTUP_RESTART_MESSAGE}</p>{status?.configPath && <div className="mt-2 border-t border-red-200/70 pt-2 dark:border-red-900/50"><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Runtime configuration</p><code className="mt-1 block select-all break-all text-[10px] leading-relaxed text-slate-700 dark:text-slate-300">{status.configPath}</code></div>}{status?.logsDirectory && <div className="mt-2"><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Logs</p><code className="mt-1 block select-all break-all text-[10px] leading-relaxed text-slate-700 dark:text-slate-300">{status.logsDirectory}</code></div>}</div>}
        </div>
        <footer className="flex shrink-0 items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[9px] leading-relaxed text-slate-500 dark:border-slate-700/60 dark:bg-[#131c2d]/60 dark:text-slate-400"><ShieldCheck aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#8a2be2] dark:text-[#FFA500]" />Service availability is verified before your workspace opens.</footer>
      </section>
    </main>
  );
}
