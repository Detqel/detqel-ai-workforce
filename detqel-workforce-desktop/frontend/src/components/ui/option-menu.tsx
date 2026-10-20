"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { PrimaryButton } from "./primary-button";

export interface MenuOption {
  value: string;
  label: string;
  description?: string | null;
  icon?: React.ReactNode;
}

interface OptionMenuProps {
  options: MenuOption[];
  value?: string;
  placeholder: string;
  label: string;
  onSelect: (value: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  disabled?: boolean;
  primary?: boolean;
  icon?: React.ReactNode;
}

export function OptionMenu({ options, value, placeholder, label, onSelect, loading, error, onRetry, disabled, primary, icon }: OptionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open, options]);

  const triggerProps = {
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    "aria-controls": menuId,
    disabled,
    onClick: () => setOpen(current => !current),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
      }
    },
  };

  return (
    <div ref={containerRef} className={`relative min-w-0 ${primary ? "inline-block" : "w-full"}`} onKeyDown={event => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (event.key === "Tab") setOpen(false);
    }}>
      {primary ? (
        <span ref={element => { triggerRef.current = element?.querySelector("button") ?? null; }}>
          <PrimaryButton {...triggerProps} value={<span className="flex items-center gap-2">{placeholder}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /></span>} icon={icon} iconPosition="left" />
        </span>
      ) : (
        <button ref={triggerRef} type="button" {...triggerProps} aria-label={label} className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm text-slate-700 outline-none transition-colors focus:border-[#8a2be2] focus:ring-2 focus:ring-[#8a2be2]/15 dark:border-slate-700 dark:bg-[#131c2d] dark:text-slate-200 dark:focus:border-[#FFA500] dark:focus:ring-[#FFA500]/15 disabled:opacity-50">
          <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          aria-busy={loading}
          className={`absolute left-0 top-full z-30 mt-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-[#182234] dark:shadow-black/30 overflow-x-hidden overflow-y-auto max-h-[min(36rem,calc(100vh-120px))] ${
            primary ? "w-84 max-w-[calc(100vw-2rem)]" : "w-full min-w-0"
          }`}
          onKeyDown={event => {
            const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && items.length) {
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
              items[next]?.focus();
            }
          }}
        >
          {loading ? (
            <div role="status" className="flex items-center gap-2 px-3 py-5 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading options…
            </div>
          ) : error ? (
            <div className="space-y-2 px-3 py-4 text-xs">
              <p role="alert" className="text-red-600 dark:text-red-400">
                {error}
              </p>
              {onRetry && (
                <button type="button" onClick={onRetry} className="font-semibold text-[#8a2be2] dark:text-[#FFA500]">
                  Try again
                </button>
              )}
            </div>
          ) : options.length ? (
            options.map(option => (
              <button
                key={option.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                  onSelect(option.value);
                }}
                className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-purple-50 focus:bg-purple-50 dark:hover:bg-[#FFA500]/10 dark:focus:bg-[#FFA500]/10 cursor-pointer"
              >
                {option.icon && (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-[#8a2be2] dark:bg-[#FFA500]/10 dark:text-[#FFA500]">
                    {option.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="mt-0.5 block break-words text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {option.description}
                    </span>
                  )}
                </span>
                {option.value === value && <Check className="h-4 w-4 text-[#8a2be2] dark:text-[#FFA500]" />}
              </button>
            ))
          ) : (
            <p className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400">No options available</p>
          )}
        </div>
      )}
    </div>
  );
}
