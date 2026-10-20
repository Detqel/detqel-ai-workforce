"use client";

import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { IconOnlyButton } from "@/components/ui/icon-only-button";

export const connectionInputClass = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#8a2be2] focus:ring-2 focus:ring-[#8a2be2]/15 dark:border-slate-700 dark:bg-[#131c2d] dark:text-slate-100 dark:focus:border-[#FFA500] dark:focus:ring-[#FFA500]/15";
export const connectionErrorClass = "rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400";

interface ConnectionDialogProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  busy?: boolean;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function ConnectionDialog({ title, description, icon, busy, wide, onClose, children }: ConnectionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className={`fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100vw_-_2rem)] ${wide ? "max-w-4xl" : "max-w-2xl"} overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-xs dark:border-slate-700 dark:bg-[#182234] dark:text-slate-100`}>
      <div className="flex max-h-[min(82dvh,44rem)] min-w-0 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-700/60">
          <div className="flex min-w-0 items-center gap-3">
            {icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-[#8a2be2] dark:bg-[#FFA500]/10 dark:text-[#FFA500]">{icon}</span>}
            <div className="min-w-0 break-words"><h2 id={titleId} className="text-sm font-bold">{title}</h2>{description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}</div>
          </div>
          <IconOnlyButton icon={<X className="h-4 w-4" />} aria-label="Close connection dialog" onClick={onClose} disabled={busy} />
        </div>
        {children}
      </div>
    </dialog>
  );
}
