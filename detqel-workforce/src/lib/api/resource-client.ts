import { API_BASE_URL } from "@/lib/api";
import { readAccessToken } from "@/lib/auth-session";

export async function apiRequest<TResult>(url: string, init?: RequestInit): Promise<TResult> {
  const headers = new Headers(init?.headers);
  const token = readAccessToken();
  if (token !== null) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(url.startsWith("/api/") ? `${API_BASE_URL}${url}` : url, { ...init, headers });
  const data = await response.json();
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as TResult;
}

export function createResourceClient<TItem, TCreate, TUpdate = Partial<TCreate>>(resource: string) {
  const baseUrl = `${API_BASE_URL}/api/${resource}`;

  return {
    list: (params?: Record<string, string>, signal?: AbortSignal) =>
      apiRequest<TItem[]>(`${baseUrl}${params ? `?${new URLSearchParams(params)}` : ""}`, { signal, cache: "no-store" }),
    get: (id: string) => apiRequest<TItem>(`${baseUrl}/${encodeURIComponent(id)}`),
    create: (payload: TCreate) => apiRequest<TItem>(baseUrl, { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: TUpdate) => apiRequest<TItem>(`${baseUrl}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (id: string) => apiRequest<{ success: boolean }>(`${baseUrl}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}
