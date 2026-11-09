"use client";

import React, { useState, useRef, useEffect, useId } from "react";
import { ChevronDown, Check, Loader2 } from "lucide-react";

export interface CustomDropdownOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: string;
}

interface CustomDropdownProps {
  options: CustomDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  icon?: React.ReactNode;
  /** Shows a filter box above long option lists. */
  searchable?: boolean;
  searchPlaceholder?: string;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  disabled = false,
  loading = false,
  loadingText = "Loading options...",
  emptyText = "No options available",
  className = "",
  triggerClassName = "",
  menuClassName = "",
  icon,
  searchable = false,
  searchPlaceholder = "Search...",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const selectedOption = options.find((opt) => opt.value === value);
  const term = query.trim().toLowerCase();
  const visibleOptions = searchable && term
    ? options.filter((opt) => opt.label.toLowerCase().includes(term))
    : options;

  // Close when clicked outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || loading) return;

    if (e.key === "Escape") {
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => {
          if (!isOpen) setQuery("");
          setIsOpen(!isOpen);
        }}
        className={`w-full px-3.5 py-2.5 rounded-xl border transition-all text-xs flex items-center justify-between gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
          isOpen
            ? "border-primary ring-2 ring-primary-ring bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
            : "border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100/60 dark:hover:bg-slate-800/80"
        } ${triggerClassName}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
          ) : selectedOption?.icon ? (
            <span className="shrink-0 text-primary">{selectedOption.icon}</span>
          ) : icon ? (
            <span className="shrink-0 text-slate-400 dark:text-slate-400">{icon}</span>
          ) : null}

          <span className="truncate text-left font-medium">
            {loading ? loadingText : selectedOption ? selectedOption.label : placeholder}
          </span>

          {selectedOption?.badge && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary-muted text-primary border border-primary-border shrink-0">
              {selectedOption.badge}
            </span>
          )}
        </div>

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-primary" : ""
          }`}
        />
      </button>

      {/* Floating Modern Dropdown Menu */}
      {isOpen && (
        <div
          id={menuId}
          role="listbox"
          tabIndex={-1}
          className={`absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl p-1.5 max-h-64 overflow-y-auto space-y-0.5 animate-in fade-in zoom-in-95 duration-150 scrollbar-thin ${menuClassName}`}
        >
          {searchable && (
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full mb-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-900 dark:text-slate-100 outline-none focus:border-primary"
            />
          )}
          {visibleOptions.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">
              {emptyText}
            </div>
          ) : (
            visibleOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.value)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-primary-muted text-primary font-semibold"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {option.icon && (
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          isSelected
                            ? "bg-primary text-primary-fg"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                        }`}
                      >
                        {option.icon}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate block font-medium">{option.label}</span>
                        {option.badge && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-primary-muted text-primary border border-primary-border">
                            {option.badge}
                          </span>
                        )}
                      </div>
                      {option.description && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-400 truncate mt-0.5">
                          {option.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

