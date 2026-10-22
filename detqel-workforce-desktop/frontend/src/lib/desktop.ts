import { DESKTOP_COMMANDS } from "@/constants/desktopConstants";
import { invoke, isTauri } from "@tauri-apps/api/core";

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

export async function desktopFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!inDesktop()) return fetch(url, init);
  const parsed = new URL(url);
  const result = await invoke<{ status: number; body: string; contentType: string }>(DESKTOP_COMMANDS.apiRequest, {
    path: parsed.pathname + parsed.search,
    method: init.method ?? "GET",
    body: init.body === undefined ? null : String(init.body),
    authorization: new Headers(init.headers).get("Authorization"),
  });
  return new Response(result.body || null, {
    status: result.status,
    headers: { "Content-Type": result.contentType },
  });
}

export const backendStatus = () => invoke<BackendStatus>(DESKTOP_COMMANDS.backendStatus);
export const notifyFrontendReady = () => invoke<void>(DESKTOP_COMMANDS.frontendReady);
