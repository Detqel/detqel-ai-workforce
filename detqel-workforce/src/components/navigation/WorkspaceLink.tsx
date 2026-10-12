"use client";

import type { ComponentProps } from "react";
import { useNavigation } from "@/context/NavigationContext";

type WorkspaceLinkProps = Omit<ComponentProps<"button">, "type"> & {
  href: string;
};

export function WorkspaceLink({
  href,
  onClick,
  children,
  ...props
}: WorkspaceLinkProps) {
  const { navigate } = useNavigation();

  return (
    <button
      {...props}
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          navigate(href);
        }
      }}
    >
      {children}
    </button>
  );
}
