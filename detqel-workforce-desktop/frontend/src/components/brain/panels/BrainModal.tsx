"use client";

import React, { useEffect, useId } from "react";
import { X, type LucideIcon } from "lucide-react";
import { IconOnlyButton } from "@/components/ui/icon-only-button";

interface BrainModalProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconClassName?: string;
  size?: "md" | "lg" | "xl";
  onClose: () => void;
  children: React.ReactNode;
}

const SIZE_CLASS = { md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" } as const;

/** The dialog frame shared by the Business Brain panels: closes on Escape or a backdrop click. */
export const BrainModal: React.FC<BrainModalProps> = ({
  title,
  subtitle,
  icon: Icon,
  iconClassName = "bg-primary-muted text-primary border-primary-border",
  size = "lg",
  onClose,
  children,
}) => {
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150 select-text"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${SIZE_CLASS[size]} max-h-[88vh] bg-white dark:bg-[#182234] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150`}
      >
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${iconClassName}`}>
              <Icon className="w-4.5 h-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                {title}
              </h2>
              {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>}
            </div>
          </div>
          <IconOnlyButton onClick={onClose} aria-label={`Close ${title}`} className="rounded-lg shrink-0" icon={<X className="w-4 h-4" />} />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};
