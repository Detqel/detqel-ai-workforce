"use client";

import Image from "next/image";
import type { ComponentType } from "react";
import { DockerIcon, Postgresql } from "@dev.icons/react";
import { AlertCircle, Boxes, CheckCircle2, Circle, Clock3, Loader2, Route, Server, ShieldCheck, XCircle } from "lucide-react";
import type { BackendStartupStep, BackendStatus } from "@/lib/desktop";

type ServiceIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const serviceIcons = new Map<string, ServiceIcon>([
  ["docker", DockerIcon],
  ["litellm-database", Postgresql],
  ["milvus", Boxes],
  ["litellm", Route],
  ["application-database", Postgresql],
  ["backend-api", Server],
]);

const stepPresentation = {
  pending: { label: "Waiting", Icon: Circle, className: "text-slate-400 dark:text-slate-500" },
  running: { label: "In progress", Icon: Loader2, className: "text-[#8a2be2] dark:text-[#FFA500]" },
  complete: { label: "Ready", Icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  error: { label: "Failed", Icon: XCircle, className: "text-red-600 dark:text-red-400" },
};

function elapsedTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function StartupStep({ step }: { step: BackendStartupStep }) {
  const Icon = serviceIcons.get(step.id);
  const presentation = stepPresentation[step.status];
  const StatusIcon = presentation.Icon;
  return (
    <li className={`flex items-center gap-3 rounded-xl px-3.5 py-3 transition-colors ${step.status === "running" ? "bg-purple-50/80 ring-1 ring-[#8a2be2]/10 dark:bg-[#FFA500]/5 dark:ring-[#FFA500]/15" : step.status === "error" ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white dark:border-slate-700/70 dark:bg-[#182234] ${step.status === "pending" ? "opacity-50" : ""}`}>{Icon && <Icon className="h-5 w-5 text-slate-600 dark:text-slate-300" aria-hidden />}</span>
      <div className="min-w-0 flex-1"><p className={`text-xs font-semibold ${step.status === "pending" ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100"}`}>{step.label}</p>{step.detail && <p className="mt-1 break-words text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{step.detail}</p>}</div>
      <span className={`flex shrink-0 items-center gap-1.5 text-[10px] font-medium ${presentation.className}`}><StatusIcon aria-hidden className={`h-3.5 w-3.5 ${step.status === "running" ? "motion-safe:animate-spin" : ""}`} /><span className="hidden sm:inline">{presentation.label}</span><span className="sr-only sm:hidden">{presentation.label}</span></span>
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
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 px-5 py-8 text-slate-900 dark:bg-[#0e1422] dark:text-slate-100">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8a2be2]/5 blur-3xl dark:bg-[#FFA500]/5" />
      <section aria-labelledby="desktop-startup-title" className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-[#182234] dark:shadow-black/20">
        <header className="px-6 pb-5 pt-7 sm:px-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3"><Image src="/images/detqel-workforce-agent-logo.png" alt="DETQEL" width={42} height={42} priority className="h-10 w-10 object-contain" /><span className="text-[11px] font-bold tracking-[0.14em] text-slate-700 dark:text-slate-200">DETQEL WORKFORCE</span></div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium tabular-nums text-slate-500 dark:border-slate-700 dark:bg-[#131c2d] dark:text-slate-400"><Clock3 aria-hidden className="h-3 w-3" /><span aria-label="Elapsed startup time">{status ? elapsedTime(status.elapsedSeconds) : "Starting"}</span></span>
          </div>
          <h1 id="desktop-startup-title" className="text-xl font-bold tracking-tight">{error ? "Startup needs your attention" : "Starting your workspace"}</h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{error ? "A required service could not become ready." : "Preparing your workspace services. You can begin once they are ready."}</p>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px]"><span role="status" aria-live="polite" className="min-w-0 truncate font-medium text-slate-600 dark:text-slate-300">{error ? "Startup interrupted" : activeStep ? activeStep.label : "Preparing runtime"}</span>{progress !== undefined && <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{completed} / {steps?.length} ready</span>}</div>
            <div role="progressbar" aria-label="Workspace startup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-[#0e1422]">{progress === undefined ? <div className={`h-full w-full rounded-full ${error ? "bg-red-400/40" : "bg-[#8a2be2]/30 motion-safe:animate-pulse dark:bg-[#FFA500]/30"}`} /> : <div className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${error ? "bg-red-500" : "bg-[#8a2be2] dark:bg-[#FFA500]"}`} style={{ width: `${progress}%` }} />}</div>
          </div>
        </header>
        {steps && steps.length > 0 && <ol aria-label="Workspace services" className="space-y-1 px-3 pb-5 sm:px-5">{steps.map(step => <StartupStep key={step.id} step={step} />)}</ol>}
        {error && <div role="alert" className="mx-6 mb-6 rounded-xl border border-red-200 bg-red-50/80 p-4 dark:border-red-900/60 dark:bg-red-950/20 sm:mx-8"><p className="flex items-start gap-2 text-xs leading-relaxed text-red-700 dark:text-red-400"><AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{error}</span></p><p className="mt-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">Resolve the issue above, then restart DETQEL Workforce.</p>{status?.configPath && <div className="mt-3 border-t border-red-200/70 pt-3 dark:border-red-900/50"><p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Runtime configuration</p><code className="mt-1 block select-all break-all text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">{status.configPath}</code></div>}</div>}
        <footer className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-3.5 text-[10px] leading-relaxed text-slate-500 dark:border-slate-700/60 dark:bg-[#131c2d]/60 dark:text-slate-400 sm:px-8"><ShieldCheck aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#8a2be2] dark:text-[#FFA500]" />Service availability is verified before your workspace opens.</footer>
      </section>
    </main>
  );
}
