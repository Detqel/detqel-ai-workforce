"use client";

import { Suspense } from "react";
import { useNavigation } from "@/context/NavigationContext";
import { pageRegistry } from "@/lib/navigation";

export function PageOutlet() {
  const { activePageId } = useNavigation();
  const Component = pageRegistry.get(activePageId)!.component;

  return (
    <Suspense key={activePageId} fallback={null}>
      <Component />
    </Suspense>
  );
}
