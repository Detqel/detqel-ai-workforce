"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { defaultPageId, pageRegistry, type AppPageId } from "@/lib/navigation";

interface NavigationContextValue {
  activePageId: AppPageId;
  navigate: (target: string) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activePageId, setActivePageId] = useState<AppPageId>(defaultPageId);

  const navigate = useCallback((target: string) => {
    const destination = new URL(target, window.location.origin);
    const pageId = (
      destination.hash.slice(1) ||
      destination.pathname.split("/").filter(Boolean).pop() ||
      defaultPageId
    ) as AppPageId;

    if (pageRegistry.has(pageId)) {
      setActivePageId(pageId);
    }
  }, []);

  const value = useMemo(
    () => ({ activePageId, navigate }),
    [activePageId, navigate],
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);

  if (!context) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }

  return context;
}
