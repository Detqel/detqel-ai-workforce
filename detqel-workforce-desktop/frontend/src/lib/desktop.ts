import { DESKTOP_COMMANDS } from "@/constants/desktopConstants";
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";

export interface BackendStartupStep {
  id: string;
  label: string;
  status: "pending" | "running" | "complete" | "error";
  detail: string | null;
}

export interface BackendStatus {
  ready: boolean;
  error: string | null;
  configPath: string;
  steps: BackendStartupStep[];
  elapsedSeconds: number;
  logsDirectory?: string | null;
}

export const inDesktop = () => typeof window !== "undefined" && isTauri();

function bridgeRequest(url: string, init: RequestInit) {
  const parsed = new URL(url);
  return {
    path: parsed.pathname + parsed.search,
    method: init.method ?? "GET",
    body: init.body === undefined || init.body === null ? null : String(init.body),
    authorization: new Headers(init.headers).get("Authorization"),
  };
}

export async function desktopFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!inDesktop()) return fetch(url, init);
  const result = await invoke<{ status: number; body: string; contentType: string }>(DESKTOP_COMMANDS.apiRequest, bridgeRequest(url, init));
  return new Response(result.body || null, {
    status: result.status,
    headers: { "Content-Type": result.contentType },
  });
}

type StreamMessage =
  | { kind: "start"; status: number; contentType: string }
  | { kind: "data"; text: string }
  | { kind: "end" }
  | { kind: "error"; message: string };

/**
 * fetch for a response that is read while it is still arriving. In the browser this is fetch itself. In the
 * desktop app the native bridge passes the response on piece by piece over a channel, and this returns a
 * Response whose body streams those pieces, so callers read it the same way in both. Aborting the signal or
 * cancelling the body stops the native stream, which closes the connection and stops the work behind it.
 */
export async function desktopStreamFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!inDesktop()) return fetch(url, init);
  const streamId = crypto.randomUUID();
  const signal = init.signal ?? undefined;
  if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
  const encoder = new TextEncoder();
  const cancel = () => { void invoke(DESKTOP_COMMANDS.apiStreamCancel, { streamId }).catch(() => undefined); };

  return new Promise<Response>((resolve, reject) => {
    let body: ReadableStreamDefaultController<Uint8Array> | null = null;
    let settled = false;
    const fail = (error: Error) => {
      if (!settled) { settled = true; reject(error); return; }
      try { body?.error(error); } catch { /* the body was already closed */ }
    };
    const onAbort = () => { cancel(); fail(new DOMException("The request was aborted.", "AbortError")); };
    signal?.addEventListener("abort", onAbort, { once: true });

    const channel = new Channel<StreamMessage>();
    channel.onmessage = message => {
      if (message.kind === "start") {
        settled = true;
        const stream = new ReadableStream<Uint8Array>({
          start: controller => { body = controller; },
          cancel: () => { signal?.removeEventListener("abort", onAbort); cancel(); },
        });
        resolve(new Response(stream, { status: message.status, headers: { "Content-Type": message.contentType } }));
      } else if (message.kind === "data") {
        body?.enqueue(encoder.encode(message.text));
      } else if (message.kind === "end") {
        signal?.removeEventListener("abort", onAbort);
        try { body?.close(); } catch { /* the reader already cancelled */ }
      } else {
        signal?.removeEventListener("abort", onAbort);
        fail(new Error(message.message));
      }
    };
    invoke(DESKTOP_COMMANDS.apiStream, { ...bridgeRequest(url, init), streamId, onEvent: channel }).catch(error => {
      signal?.removeEventListener("abort", onAbort);
      fail(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

export const backendStatus = () => invoke<BackendStatus>(DESKTOP_COMMANDS.backendStatus);
export const notifyFrontendReady = () => invoke<void>(DESKTOP_COMMANDS.frontendReady);
