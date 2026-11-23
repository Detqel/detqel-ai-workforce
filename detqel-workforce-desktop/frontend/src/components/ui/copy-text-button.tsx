"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/context/ToastContext";

interface CopyTextButtonProps {
  text: string;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function CopyTextButton({ text, label, disabled = false, className = "" }: CopyTextButtonProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const copying = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  async function copyText() {
    if (disabled || copying.current || !text.trim()) return;
    copying.current = true;
    setBusy(true);
    setCopied(false);
    if (timer.current !== null) clearTimeout(timer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable");
      await navigator.clipboard.writeText(text);
      if (!mounted.current) return;
      setCopied(true);
      timer.current = setTimeout(() => { if (mounted.current) setCopied(false); }, 2000);
    } catch {
      if (mounted.current) toast.error("Unable to copy text. Check clipboard permissions and try again.");
    } finally {
      copying.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <button
    type="button"
    onClick={(event) => { event.stopPropagation(); void copyText(); }}
    disabled={disabled || busy || !text.trim()}
    aria-label={copied ? "Copied to clipboard" : label}
    title={copied ? "Copied!" : label}
    className={`inline-flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 ${className}`}
  >
    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
    <span role="status" className="sr-only">{copied ? "Copied to clipboard" : ""}</span>
  </button>;
}
