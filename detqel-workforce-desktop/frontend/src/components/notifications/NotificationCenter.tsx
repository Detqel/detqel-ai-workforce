"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bell, CheckCheck, Download, Loader2, X } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import type { UserNotification } from "@/lib/api";
import { NotificationIcon } from "./NotificationIcon";

type Filter = "all" | "unread" | "downloads";
function timeLabel(iso: string) {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return Math.floor(elapsed / 60_000) + "m ago";
  if (elapsed < 86_400_000) return Math.floor(elapsed / 3_600_000) + "h ago";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function NotificationCenter({ onNavigate, onClose }: { onNavigate: (link: string) => void; onClose: () => void }) {
  const { notifications, unreadCount, loading, loadError, refresh, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<Set<string>>(new Set());
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => { heading.current?.focus(); void refresh(); }, [refresh]);
  const items = notifications.filter(item => filter === "unread" ? !item.isRead : filter === "downloads" ? item.type === "download" : true);
  const read = async (item: UserNotification) => {
    if (reading.has(item.id)) return;
    setReading(ids => new Set(ids).add(item.id));
    try {
      const updated = await markRead(item);
      if (updated && item.link) { onNavigate(item.link); onClose(); }
    } finally { setReading(ids => { const next = new Set(ids); next.delete(item.id); return next; }); }
  };
  return (
    <section role="dialog" aria-labelledby={titleId} className="kin-activity-toast w-[min(360px,calc(100vw-5rem))] overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_80px_-20px_rgba(42,23,73,0.4)] dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 bg-gradient-to-br from-primary-muted to-transparent px-4 pb-3 pt-4 dark:border-slate-800">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">Your activity</span>
          <button type="button" onClick={onClose} aria-label="Close notifications" className="rounded-full p-1 text-slate-400 hover:bg-primary-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"><X className="size-4" /></button>
        </div>
        <div className="flex items-center gap-2">
          <h2 ref={heading} tabIndex={-1} id={titleId} className="text-base font-semibold tracking-tight text-slate-900 outline-none dark:text-white">Notifications</h2>
          {unreadCount > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-fg">{unreadCount}</span>}
        </div>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Downloads, updates, and everything in between.</p>
        <div className="mt-4 flex gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-slate-800" role="group" aria-label="Filter notifications">
          {([['all', 'All activity'], ['unread', 'Unread'], ['downloads', 'Downloads']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={["flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary", filter === id ? "bg-white text-primary shadow-sm dark:bg-slate-700" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"].join(" ")}>{id === "downloads" && <Download className="size-3" />}{label}</button>)}
        </div>
      </div>
      {loadError && <div className="mx-3 mt-3 rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{loadError}<button type="button" onClick={() => void refresh()} className="ml-1 font-semibold underline">Retry</button></div>}
      <div className="max-h-[min(360px,50vh)] overflow-y-auto p-2" aria-busy={loading}>
        {loading && items.length === 0 ? <div className="flex justify-center p-8" role="status" aria-label="Loading notifications"><Loader2 className="size-5 animate-spin text-primary" /></div>
          : items.length === 0 ? <div className="flex flex-col items-center px-5 py-9 text-center"><span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary-muted text-primary">{filter === "downloads" ? <Download className="size-5" /> : <Bell className="size-5" />}</span><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{filter === "unread" ? "You’re all caught up" : filter === "downloads" ? "No downloads yet" : "A little quiet here"}</p><p className="mt-1 text-[11px] leading-relaxed text-slate-400">{filter === "downloads" ? "Your document downloads will appear here." : "Your activity and account updates appear here."}</p></div>
          : <ul className="space-y-1">{items.map(item => <li key={item.id}><button type="button" disabled={busy || reading.has(item.id)} onClick={() => void read(item)} aria-label={(item.isRead ? "" : "Unread: ") + item.title + ". " + item.message} className={["flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 dark:hover:bg-slate-800", item.isRead ? "" : "bg-primary-muted"].join(" ")}>
            <NotificationIcon type={item.type} small />
            <span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><span className="break-words text-xs font-semibold leading-relaxed text-slate-800 dark:text-slate-100">{item.title}</span>{!item.isRead && <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />}</span><span className="mt-0.5 block break-words text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{item.message}</span><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()} className="mt-1.5 block text-[9px] font-medium text-slate-400">{timeLabel(item.createdAt)}</time></span>
          </button></li>)}</ul>}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-800"><span className="text-[10px] text-slate-400">{filter === "downloads" ? "Download history" : "Recent activity"}</span><button type="button" disabled={unreadCount === 0 || busy || reading.size > 0} onClick={async () => { setBusy(true); try { await markAllRead(); } finally { setBusy(false); } }} className="flex items-center gap-1.5 rounded-md text-[10px] font-semibold text-primary disabled:cursor-default disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary">{busy ? <Loader2 className="size-3 animate-spin" /> : <CheckCheck className="size-3.5" />}Mark all read</button></div>
    </section>
  );
}
