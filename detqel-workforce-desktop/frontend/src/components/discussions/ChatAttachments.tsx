"use client";
import { useCallback, useRef, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { apiDeleteSessionKnowledge, apiUploadSessionKnowledge } from "@/lib/api/discussions";
import { readKnowledgeUpload } from "@/lib/knowledge-upload";
import { formatFileSize } from "@/lib/download";
import { CHAT_ATTACHMENT_MAX_BYTES, CHAT_MAX_ATTACHMENTS } from "@/constants/discussionConstants";

export interface ComposerAttachment {
  /** Stable key while the file uploads; the stored name replaces it once known. */
  key: string;
  label: string;
  size: number;
  /** The knowledge file name on the server, once uploaded. */
  name?: string;
  failed?: boolean;
}

/**
 * Files picked for the next message. Each uploads at once as the discussion's knowledge, so the agent can read it,
 * and the message carries only the stored names.
 */
export function useComposerAttachments(workspaceId: string | undefined, sessionId: string | undefined) {
  const toast = useToast();
  const [items, setItems] = useState<ComposerAttachment[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const add = useCallback(async (files: ReadonlyArray<File>) => {
    if (!workspaceId || !sessionId) { toast.error("Open a discussion before attaching a document."); return; }
    for (const file of files) {
      if (itemsRef.current.length >= CHAT_MAX_ATTACHMENTS) { toast.error(`A message can carry up to ${CHAT_MAX_ATTACHMENTS} documents.`); return; }
      if (file.size > CHAT_ATTACHMENT_MAX_BYTES) { toast.error(`"${file.name}" is larger than ${formatFileSize(CHAT_ATTACHMENT_MAX_BYTES)}.`); continue; }
      const key = `${Date.now()}-${file.name}-${Math.random()}`;
      const item: ComposerAttachment = { key, label: file.name, size: file.size };
      itemsRef.current = [...itemsRef.current, item];
      setItems(itemsRef.current);
      try {
        const result = await apiUploadSessionKnowledge(workspaceId, sessionId, await readKnowledgeUpload(file));
        if (!result.indexed) toast.info(`"${result.name}" is attached. It is not searchable, so agents read it directly.`);
        itemsRef.current = itemsRef.current.map(entry => (entry.key === key ? { ...entry, name: result.name } : entry));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not attach "${file.name}".`);
        itemsRef.current = itemsRef.current.filter(entry => entry.key !== key);
      }
      setItems(itemsRef.current);
    }
  }, [workspaceId, sessionId, toast]);

  /** Removes a chip; its knowledge file is deleted too, since it was only added for this message. */
  const remove = useCallback((key: string) => {
    const item = itemsRef.current.find(entry => entry.key === key);
    itemsRef.current = itemsRef.current.filter(entry => entry.key !== key);
    setItems(itemsRef.current);
    if (item?.name && workspaceId && sessionId) void apiDeleteSessionKnowledge(workspaceId, sessionId, item.name).catch(() => undefined);
  }, [workspaceId, sessionId]);

  /** Forgets the chips once a message carries them; the files stay as the discussion's knowledge. */
  const clear = useCallback(() => { itemsRef.current = []; setItems([]); }, []);

  /** Puts chips back when a message was not saved, so the attached files are not lost. */
  const restore = useCallback((previous: ReadonlyArray<ComposerAttachment>) => { itemsRef.current = [...previous]; setItems(itemsRef.current); }, []);

  const uploading = items.some(item => !item.name);
  const names = items.flatMap(item => (item.name ? [item.name] : []));
  return { items, names, uploading, add, remove, clear, restore };
}

/** Attached documents as chips: removable in the composer, read-only on a sent message. */
export function AttachmentChips({ items, onRemove }: { items: ReadonlyArray<{ key: string; label: string; size: number; uploading?: boolean }>; onRemove?: (key: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Attached documents">
      {items.map(item => (
        <li key={item.key} className="flex max-w-56 items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
          {item.uploading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" aria-label="Uploading" /> : <FileText className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />}
          <span className="truncate" title={`${item.label} (${formatFileSize(item.size)})`}>{item.label}</span>
          {onRemove && <button type="button" onClick={() => onRemove(item.key)} aria-label={`Remove ${item.label}`} className="shrink-0 rounded p-0.5 text-slate-400 hover:text-red-500 cursor-pointer"><X className="h-3 w-3" /></button>}
        </li>
      ))}
    </ul>
  );
}