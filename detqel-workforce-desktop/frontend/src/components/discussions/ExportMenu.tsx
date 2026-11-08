"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { EXPORT_FORMATS } from "@/constants/discussionConstants";
import type { ExportFormat } from "@/lib/api/discussions";

interface ExportMenuProps {
  /** Exports in the chosen format; the menu shows progress until it settles. */
  onExport: (format: ExportFormat) => Promise<void>;
  formats?: ReadonlyArray<ExportFormat>;
  disabled?: boolean;
  /** Names what is exported, for screen readers: "Export MAX's handoff". */
  label: string;
  /** Opens upward, for menus near the bottom of the window. */
  dropUp?: boolean;
}

/** An "Export" button with a small menu of formats. */
export function ExportMenu({ onExport, formats, disabled, label, dropUp = false }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const options = EXPORT_FORMATS.filter((option) => !formats || formats.includes(option.format));

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", onPointer);
    // Capture, so Escape closes this menu before a surrounding viewer sees it.
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const choose = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(format);
    try {
      await onExport(format);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled || busy !== null}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 text-[11px] font-semibold hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
        Export
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={`absolute right-0 z-50 min-w-36 p-1 rounded-xl bg-white dark:bg-[#11182c] border border-slate-200 dark:border-slate-700 shadow-xl ${dropUp ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          {options.map((option) => (
            <button
              key={option.format}
              type="button"
              role="menuitem"
              onClick={() => void choose(option.format)}
              className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
