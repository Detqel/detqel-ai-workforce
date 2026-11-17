"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { apiCreateUserNotification, apiGetUserNotifications, apiMarkAllNotificationsRead, apiMarkNotificationRead, type UserNotification } from "@/lib/api";
import { formatFileSize, type DownloadReceipt } from "@/lib/download";
import { NotificationStore, type NotificationSnapshot } from "@/lib/notification-store";
import { ActivityToast, type ActivityToastItem } from "@/components/notifications/ActivityToast";

export type ToastKind = "success" | "error" | "info";
interface Feedback {
  showToast: (kind: ToastKind, text: string) => void;
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
  download: (file: DownloadReceipt) => void;
}
interface NotificationState extends NotificationSnapshot {
  isCenterOpen: boolean;
  openCenter: () => void;
  closeCenter: () => void;
  refresh: () => Promise<void>;
  markRead: (item: UserNotification) => Promise<boolean>;
  markAllRead: () => Promise<void>;
}
type ScopedToast = ActivityToastItem & { scope: NotificationStore };
const FeedbackContext = createContext<Feedback | undefined>(undefined);
const NotificationContext = createContext<NotificationState | undefined>(undefined);
const notificationApi = { list: apiGetUserNotifications, create: apiCreateUserNotification, markRead: apiMarkNotificationRead, markAllRead: apiMarkAllNotificationsRead };

/** Popups and the bell share one history, scoped to the signed-in account and workspace. */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, currentWorkspace } = useWorkspace();
  const userId = user?.id;
  const workspaceId = currentWorkspace?.id;
  // Changing scope replaces only the store; the rest of the application stays mounted.
  const store = useMemo(() => new NotificationStore({ userId, workspaceId }, notificationApi), [userId, workspaceId]);
  const scope = store;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [toasts, setToasts] = useState<ScopedToast[]>([]);
  const [openedScope, setOpenedScope] = useState<NotificationStore | null>(null);
  const [announcement, setAnnouncement] = useState({ scope: null as NotificationStore | null, text: "", urgent: false });
  const openCenter = useCallback(() => setOpenedScope(scope), [scope]);
  const closeCenter = useCallback(() => setOpenedScope(null), []);
  const dismiss = useCallback((id: string) => setToasts(items => items.filter(item => item.id !== id)), []);

  useEffect(() => {
    void store.refresh();
    const timer = setInterval(() => { if (!document.hidden) void store.refresh(); }, 30_000);
    const onFocus = () => void store.refresh();
    window.addEventListener("focus", onFocus);
    return () => { store.cancelRefresh(); clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [store]);

  const present = useCallback((item: ActivityToastItem) => {
    setToasts(items => [...items.filter(item => item.scope === scope).slice(-2), { ...item, scope }]);
    setAnnouncement({ scope, text: item.title + ". " + item.message, urgent: item.type === "alert" });
  }, [scope]);

  const publish = useCallback((type: UserNotification["type"], title: string, message: string, detail?: string) => {
    if (!userId) {
      present({ id: crypto.randomUUID(), type, title, message, detail, history: "none" });
      return;
    }
    const { id, saved } = store.create(type, title, message + (detail ? " · " + detail : ""));
    present({ id, type, title, message, detail, history: "saving" });
    void saved.then(persisted => setToasts(items => items.map(item => item.id === id ? { ...item, history: persisted ? "saved" : "local" } : item)));
  }, [store, userId, present]);

  const showToast = useCallback((kind: ToastKind, text: string) => {
    publish(kind === "error" ? "alert" : kind, kind === "error" ? "Something went wrong" : kind === "success" ? "All done" : "For your attention", text);
  }, [publish]);
  // Stable feedback prevents consumer effects from rerunning whenever history changes.
  const feedback = useMemo<Feedback>(() => ({
    showToast,
    success: text => showToast("success", text),
    error: text => showToast("error", text),
    info: text => showToast("info", text),
    download: file => {
      const format = file.fileName.split(".").pop()?.toUpperCase() || "File";
      // The browser confirms initiation, but does not expose completion of a disk save.
      publish("download", format + " download started", file.fileName, formatFileSize(file.size));
    },
  }), [showToast, publish]);

  const readFailure = useCallback(() => present({ id: crypto.randomUUID(), type: "alert", title: "Could not update notifications", message: "Please try again.", history: "none" }), [present]);
  const markRead = useCallback(async (item: UserNotification) => {
    const updated = await store.markRead(item.id);
    if (!updated) readFailure();
    return updated;
  }, [store, readFailure]);
  const markAllRead = useCallback(async () => {
    if (!await store.markAllRead()) readFailure();
  }, [store, readFailure]);
  const state = useMemo(() => ({ ...snapshot, isCenterOpen: openedScope === scope, openCenter, closeCenter, refresh: store.refresh, markRead, markAllRead }), [snapshot, openedScope, scope, openCenter, closeCenter, store, markRead, markAllRead]);
  const visibleToasts = toasts.filter(item => item.scope === scope);
  const announce = announcement.scope === scope ? announcement.text : "";
  return (
    <FeedbackContext.Provider value={feedback}>
      <NotificationContext.Provider value={state}>
        {children}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{!announcement.urgent && announce}</div>
        <div className="sr-only" role="alert" aria-atomic="true">{announcement.urgent && announce}</div>
        <section aria-label="Recent activity" className="fixed bottom-5 right-5 z-[100] flex w-[calc(100vw-2.5rem)] max-w-sm flex-col gap-3 pointer-events-none">
          {visibleToasts.map(item => <ActivityToast key={item.id} item={item} dismiss={dismiss} openHistory={openCenter} />)}
        </section>
      </NotificationContext.Provider>
    </FeedbackContext.Provider>
  );
}

export function useToast(): Feedback {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useToast must be used within NotificationProvider");
  return value;
}
export function useNotifications(): NotificationState {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("useNotifications must be used within NotificationProvider");
  return value;
}
