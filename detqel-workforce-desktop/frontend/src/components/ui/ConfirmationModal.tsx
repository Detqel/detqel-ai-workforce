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
import { PrimaryButton } from "./primary-button";
import { SecondaryButton } from "./secondary-button";
import { IconOnlyButton } from "./icon-only-button";

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
        return <AlertCircle className="w-4 h-4 text-[#8a2be2] dark:text-[#FFA500] shrink-0" />;
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
        return "bg-[#8a2be2] dark:bg-[#FFA500] hover:bg-[#7b24ca] dark:hover:bg-[#FFA500]/90 text-white dark:text-slate-950 font-bold shadow-xs shadow-[#8a2be2]/20 dark:shadow-[#FFA500]/20";
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
              className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate"
            >
              {title}
            </h3>
          </div>
          <IconOnlyButton
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-lg shrink-0"
            aria-label="Close modal"
            icon={<X className="w-4 h-4" />}
          />
        </div>

        {/* SECTION 2: MIDDLE (Message content and optional error) */}
        <div className="px-6 py-5">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
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
          <SecondaryButton
            onClick={onClose}
            disabled={isLoading}
            value={cancelText}
          />
          <PrimaryButton
            onClick={onConfirm}
            disabled={isLoading}
            className={getConfirmButtonClasses()}
            value={isLoading ? "Processing..." : confirmText}
            icon={isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined}
            iconPosition="left"
          />
        </div>
      </div>
    </div>
  );
};
