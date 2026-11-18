"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { CONNECTOR_FILE_ACCEPT, CONNECTOR_FILE_MAX_BYTES } from "@/constants/connectorConstants";
import { formatFileSize } from "@/lib/download";
import { connectionErrorClass, connectionInputClass } from "./ConnectionDialog";

interface FileConnectorUploadProps {
  configuration: Record<string, unknown>;
  hasStoredFile: boolean;
  onChange: (configuration: Record<string, unknown>) => void;
  onReadingChange: (reading: boolean) => void;
}

export function FileConnectorUpload({ configuration, hasStoredFile, onChange, onReadingChange }: FileConnectorUploadProps) {
  const readerRef = useRef<FileReader | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const hasFile = typeof configuration.fileName === "string" && (hasStoredFile || typeof configuration.fileContent === "string");

  useEffect(() => () => {
    const reader = readerRef.current;
    readerRef.current = null;
    reader?.abort();
  }, []);

  function selectFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.size || file.size > CONNECTOR_FILE_MAX_BYTES) {
      setError("Choose a nonempty file that is 5 MB or smaller.");
      return;
    }
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!CONNECTOR_FILE_ACCEPT.split(",").includes(extension)) {
      setError("Choose one of the supported text or structured data files listed below.");
      return;
    }
    readerRef.current?.abort();
    const reader = new FileReader();
    readerRef.current = reader;
    setReading(true);
    onReadingChange(true);
    reader.onload = () => {
      if (readerRef.current !== reader) return;
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string" || !dataUrl.includes(";base64,")) {
        setError("The file could not be read. Select it again.");
        return;
      }
      onChange({ fileName: file.name, mimeType: file.type || "text/plain", fileSize: file.size, fileContent: dataUrl.slice(dataUrl.indexOf(",") + 1) });
    };
    reader.onerror = () => { if (readerRef.current === reader) setError("The file could not be read. Check access to the file and select it again."); };
    reader.onloadend = () => {
      if (readerRef.current !== reader) return;
      readerRef.current = null;
      setReading(false);
      onReadingChange(false);
    };
    reader.readAsDataURL(file);
  }

  return <div className="space-y-3">
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold">{hasFile ? "Replace uploaded file" : "Upload file"}{!hasFile && <span className="ml-1 text-red-500">*</span>}</span>
      <input type="file" accept={CONNECTOR_FILE_ACCEPT} required={!hasFile} disabled={reading} className={`${connectionInputClass} file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary-muted file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; selectFile(file); }} />
    </label>
    {reading ? <p role="status" className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Reading file…</p> : hasFile && <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700"><FileUp className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 break-all font-medium">{String(configuration.fileName)}</span>{typeof configuration.fileSize === "number" && <span className="ml-auto shrink-0 text-slate-500">{formatFileSize(configuration.fileSize)}</span>}</div>}
    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Upload a UTF-8 text file up to 5 MB: TXT, Markdown, CSV, TSV, JSON, XML, YAML, TOML, INI, LOG, SQL, HTML or RST. The saved copy is encrypted; agents can read it without access to the original file.</p>
    {hasStoredFile && <p className="text-[11px] text-slate-500 dark:text-slate-400">Your saved file is kept unless you select a replacement.</p>}
    {error && <p role="alert" className={connectionErrorClass}>{error}</p>}
  </div>;
}
