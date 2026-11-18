"use client";

import { useState, type ReactNode } from "react";

/** Clicking the message reveals its time without competing with selection or message actions. */
export function MessageSurface({ children, timestamp, className }: { children: ReactNode; timestamp: string; className: string }) {
  const [showTime, setShowTime] = useState(false);
  return (
    <div
      className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring`}
      role="group"
      tabIndex={0}
      aria-label={`Message. Press Enter to ${showTime ? "hide" : "show"} timestamp.`}
      onClick={event => {
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input, textarea, summary, label, [role='button']") || window.getSelection()?.toString()) return;
        setShowTime(value => !value);
      }}
      onKeyDown={event => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          setShowTime(value => !value);
        }
      }}
    >
      {children}
      <div aria-hidden={!showTime} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${showTime ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden min-h-0">
          <div className="pt-2 text-right text-[9px] text-slate-400"><time>{timestamp}</time></div>
        </div>
      </div>
    </div>
  );
}
