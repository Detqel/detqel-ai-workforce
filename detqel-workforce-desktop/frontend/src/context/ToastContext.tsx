"use client";

// Keep existing feedback callers on the shared notification system.
export { NotificationProvider as ToastProvider, useToast } from "./NotificationContext";
export type { ToastKind } from "./NotificationContext";
