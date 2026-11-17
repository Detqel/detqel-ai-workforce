"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import type { UserNotification } from "@/lib/api";
import { NotificationIcon } from "./NotificationIcon";

export interface ActivityToastItem {
  id: string;
  title: string;
  message: string;
  type: UserNotification["type"];
  detail?: string;
  history: "saving" | "saved" | "local" | "none";
}

export function ActivityToast({ item, dismiss, openHistory }: {
  item: ActivityToastItem;
  dismiss: (id: string) => void;
  openHistory: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(item.type === "alert" ? 9000 : 6000);
  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [paused, dismiss, item.id]);

  return (
    <div
      className="kin-activity-toast pointer-events-auto overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/95 shadow-[0_18px_65px_-16px_rgba(42,23,73,0.35)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    >
      <div className="flex items-center justify-between px-4 pt-3">
        <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400"><span className="size-1.5 rounded-full bg-primary" />KIN activity</span>
        <button type="button" onClick={() => dismiss(item.id)} aria-label={"Dismiss " + item.title} className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-primary dark:hover:bg-slate-800 dark:hover:text-white"><X className="size-3.5" /></button>
      </div>
      <div className="flex items-center gap-3 px-4 pb-4 pt-2">
        <NotificationIcon type={item.type} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">{item.title}</p>
          <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.message}</p>
          {item.detail && <p className="mt-1 text-[10px] font-medium text-slate-400">{item.detail}</p>}
        </div>
      </div>
      {item.history !== "none" && <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/40">
        <span className="text-[10px] text-slate-400">{item.history === "saving" ? "Adding to notifications…" : item.history === "local" ? "In this session’s notifications" : "Saved in notifications"}</span>
        <button type="button" onClick={() => { openHistory(); dismiss(item.id); }} className="flex items-center gap-1 rounded-md text-[10px] font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">View<ArrowUpRight className="size-3" /></button>
      </div>}
    </div>
  );
}
