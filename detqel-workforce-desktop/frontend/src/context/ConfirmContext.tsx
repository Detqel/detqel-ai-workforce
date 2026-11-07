"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { ConfirmationModal, type ConfirmationModalProps } from "@/components/ui/ConfirmationModal";

export type ConfirmOptions = Pick<ConfirmationModalProps, "title" | "message" | "confirmText" | "cancelText" | "variant" | "icon">;

interface ConfirmContextType {
  /** Opens the shared confirmation modal and resolves true if confirmed, false if cancelled. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

/**
 * Provides a single, promise-based confirmation flow backed by the shared ConfirmationModal. Any action that
 * requires explicit user review (for example a connector write/update/delete) awaits confirm() before it runs,
 * rather than each feature wiring its own modal or using a native dialog.
 */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setOptions(null);
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmationModal
        isOpen={options !== null}
        title={options?.title ?? ""}
        message={options?.message ?? ""}
        confirmText={options?.confirmText}
        cancelText={options?.cancelText}
        variant={options?.variant}
        icon={options?.icon}
        onConfirm={() => settle(true)}
        onClose={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
};

export function useConfirm(): ConfirmContextType["confirm"] {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within a ConfirmProvider");
  return context.confirm;
}
