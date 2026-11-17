import { AlertCircle, Check, Download, Info, TriangleAlert } from "lucide-react";
import type { UserNotification } from "@/lib/api";

export function NotificationIcon({ type, small = false }: { type: UserNotification["type"]; small?: boolean }) {
  const Icon = type === "download" ? Download : type === "success" ? Check : type === "alert" ? AlertCircle : type === "warning" ? TriangleAlert : Info;
  const color = type === "download" ? "bg-primary-muted text-primary ring-primary-border"
    : type === "success" ? "bg-emerald-50 text-emerald-600 ring-emerald-200/60 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20"
    : type === "alert" ? "bg-rose-50 text-rose-600 ring-rose-200/60 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20"
    : type === "warning" ? "bg-amber-50 text-amber-600 ring-amber-200/60 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20"
    : "bg-sky-50 text-sky-600 ring-sky-200/60 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20";
  return (
    <span aria-hidden="true" className={["relative flex shrink-0 items-center justify-center ring-1 ring-inset", small ? "size-8 rounded-xl" : "size-11 rounded-2xl", color].join(" ")}>
      <Icon className={small ? "size-4" : "size-5"} strokeWidth={1.8} />
      {type === "download" && !small && <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white dark:ring-slate-900"><Check className="size-2.5" strokeWidth={3} /></span>}
    </span>
  );
}
