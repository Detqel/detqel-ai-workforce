"use client";

import React, { useEffect, useRef } from "react";
import {
  Trash2,
  AlertTriangle,
  Info,
  AlertCircle,
  X,
  Loader2,
} from "lucide-react";

export interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  error?: string | null;
  variant?: "danger" | "warning" | "info" | "primary";
  icon?: React.ReactNode;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Yes",
  cancelText = "No",
  isLoading = false,
  error = null,
  variant = "danger",
  icon,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  // Header packaged icon (packaged SVG icon, zero emojis or images)
  const renderHeaderIcon = () => {
    if (icon) return icon;

    switch (variant) {
      case "danger":
        return <Trash2 className="w-4 h-4 text-red-600 shrink-0" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case "info":
        return <Info className="w-4 h-4 text-blue-500 shrink-0" />;
      case "primary":
      default:
        return <AlertCircle className="w-4 h-4 text-[#8a2be2] shrink-0" />;
    }
  };

  const getConfirmButtonClasses = () => {
    switch (variant) {
      case "danger":
        return "bg-red-600 hover:bg-red-700 text-white shadow-xs shadow-red-600/20";
      case "warning":
        return "bg-amber-600 hover:bg-amber-700 text-white shadow-xs shadow-amber-600/20";
      case "info":
        return "bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-600/20";
      case "primary":
      default:
        return "bg-[#8a2be2] hover:bg-[#7b24ca] text-white shadow-xs shadow-[#8a2be2]/20";
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        className="w-full max-w-md bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-150"
      >
        {/* SECTION 1: HEADER (Icon with title on left, close icon on right) */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0 pr-2">
            {renderHeaderIcon()}
            <h3
              id="confirmation-modal-title"
              className="text-sm sm:text-base font-bold text-slate-900 dark:text-purple-100 tracking-tight truncate"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-purple-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SECTION 2: MIDDLE (Message content and optional error) */}
        <div className="px-6 py-5">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-purple-200/90 leading-relaxed font-normal">
            {message}
          </p>

          {error && (
            <div className="mt-3.5 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-center gap-2 text-xs text-red-600 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* SECTION 3: FOOTER (Action buttons) */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0e1422] flex items-center justify-end gap-2.5 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161f30] text-xs font-semibold text-slate-700 dark:text-purple-200 hover:bg-slate-50 dark:hover:bg-[#1d2940] active:scale-[0.99] transition-all cursor-pointer shadow-2xs disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded-xl text-xs font-semibold active:scale-[0.99] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 ${getConfirmButtonClasses()}`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{confirmText}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
