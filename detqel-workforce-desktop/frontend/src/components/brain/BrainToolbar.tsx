"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  LayoutGrid,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  BRAIN_TIMEFRAME_OPTIONS,
  BRAIN_WIDGET_DEFINITIONS,
  type BrainTimeframeId,
  type BrainWidgetId,
  type BrainWidgetLayout,
} from "@/constants/brainConstants";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SecondaryButton } from "@/components/ui/secondary-button";

interface BrainToolbarProps {
  timeframe: BrainTimeframeId;
  isEditingLayout: boolean;
  layout: BrainWidgetLayout[];
  onTimeframeChange: (timeframe: BrainTimeframeId) => void;
  onToggleEditLayout: () => void;
  onResetLayout: () => void;
  onToggleWidgetVisibility: (widgetId: BrainWidgetId) => void;
}

export const BrainToolbar: React.FC<BrainToolbarProps> = ({
  timeframe,
  isEditingLayout,
  layout,
  onTimeframeChange,
  onToggleEditLayout,
  onResetLayout,
  onToggleWidgetVisibility,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const activeOption =
    BRAIN_TIMEFRAME_OPTIONS.find((option) => option.id === timeframe) ??
    BRAIN_TIMEFRAME_OPTIONS[1];

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    const selectedButton =
      menuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ??
      menuRef.current?.querySelector<HTMLButtonElement>('[role="option"]');
    selectedButton?.focus();

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0 space-y-2.5 bg-white dark:bg-[#182234]">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Edit Layout controls & provenance indicator */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {isEditingLayout ? (
            <>
              <PrimaryButton
                onClick={onToggleEditLayout}
                value="Done"
                icon={<Check className="w-3.5 h-3.5" />}
                iconPosition="left"
                className="px-3 py-1.5 text-[11px]"
              />
              <SecondaryButton
                onClick={onResetLayout}
                value="Reset"
                icon={<RotateCcw className="w-3.5 h-3.5" />}
                iconPosition="left"
                className="px-3 py-1.5 text-[11px]"
              />
              <span className="hidden @xl:inline-flex items-center px-2 py-1 rounded-lg bg-primary-muted border border-primary-border text-[10px] font-semibold text-primary">
                Slide edges to resize · Drag header to move
              </span>
            </>
          ) : (
            <>
              <SecondaryButton
                onClick={onToggleEditLayout}
                value="Edit Layout"
                icon={<LayoutGrid className="w-3.5 h-3.5 text-primary" />}
                iconPosition="left"
                className="px-3 py-1.5 text-[11px]"
              />
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-900/60 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>Gold Context · 12m ago</span>
              </span>
            </>
          )}
        </div>

        {/* Right: Timeframe Selector */}
        <div ref={dropdownRef} className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            aria-controls={listboxId}
            onClick={() => setMenuOpen((prev) => !prev)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setMenuOpen(true);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-[#131c2d] hover:border-primary-border px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
          >
            <span>{activeOption.label}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-400 transition-transform duration-200 ${
                menuOpen ? "rotate-180 text-primary" : ""
              }`}
              aria-hidden="true"
            />
          </button>

          {menuOpen && (
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-label="Select intelligence timeframe"
              onKeyDown={(event) => {
                const options = Array.from(
                  menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
                );
                if (!options.length) return;
                const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const delta = event.key === "ArrowUp" ? -1 : 1;
                  const nextIndex =
                    (Math.max(0, currentIndex) + delta + options.length) % options.length;
                  options[nextIndex]?.focus();
                } else if (event.key === "Home") {
                  event.preventDefault();
                  options[0]?.focus();
                } else if (event.key === "End") {
                  event.preventDefault();
                  options[options.length - 1]?.focus();
                }
              }}
              className="absolute right-0 top-full mt-1.5 z-30 w-40 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#182234] p-1.5 shadow-xl shadow-slate-900/10 dark:shadow-black/30 animate-in fade-in zoom-in-95 duration-100"
            >
              {BRAIN_TIMEFRAME_OPTIONS.map((option) => {
                const isSelected = option.id === timeframe;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onTimeframeChange(option.id);
                      setMenuOpen(false);
                      triggerRef.current?.focus();
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl text-[11px] transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-primary-muted text-primary font-semibold"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#131c2d]"
                    }`}
                  >
                    <span>{option.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section Visibility Chooser (visible only in Edit Layout mode) */}
      {isEditingLayout && (
        <div
          role="group"
          aria-label="Choose sections to display in left workspace"
          className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5"
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1">
            Sections:
          </span>
          {layout.map((item) => {
            const def = BRAIN_WIDGET_DEFINITIONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.visible}
                onClick={() => onToggleWidgetVisibility(item.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${
                  item.visible
                    ? "bg-primary-muted border-primary text-primary"
                    : "bg-slate-50 dark:bg-[#131c2d] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-primary-border hover:text-primary"
                }`}
              >
                {item.visible ? (
                  <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                ) : (
                  <Plus className="w-3 h-3 shrink-0" aria-hidden="true" />
                )}
                <span>{def.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
