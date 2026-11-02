import { API_PATHS } from "@/constants/apiConstants";
import { desktopFetch } from "@/lib/desktop";
import { API_BASE_URL } from "@/lib/api";
import { readAccessToken, restoreSession } from "@/lib/auth-session";
import { AUTH_STORAGE_KEYS } from "@/constants/authConstants";

export async function apiRequest<TResult>(url: string, init?: RequestInit): Promise<TResult> {
  const headers = new Headers(init?.headers);
  let token = readAccessToken();

  if (!token && typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEYS.user);
      if (stored) {
        const user = JSON.parse(stored);
        if (user?.id) {
          token = await restoreSession(user.id);
        }
      }
    } catch {
      // Proceed without token; if rejected, 401 handler below will attempt renewal
    }
  }

  if (token !== null) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body !== undefined) headers.set("Content-Type", "application/json");

  const fullUrl = url.startsWith(API_PATHS.prefix) ? `${API_BASE_URL}${url}` : url;
  let response = await desktopFetch(fullUrl, { ...init, headers });

  if (response.status === 401 && typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEYS.user);
      if (stored) {
        const user = JSON.parse(stored);
        if (user?.id) {
          const renewedToken = await restoreSession(user.id);
          if (renewedToken) {
            headers.set("Authorization", `Bearer ${renewedToken}`);
            response = await desktopFetch(fullUrl, { ...init, headers });
          }
        }
      }
    } catch {
      // Session restoration failed; continue to handle response error
    }
  }

  const data = await response.json();
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as TResult;
}

export function createResourceClient<TItem, TCreate, TUpdate = Partial<TCreate>>(resource: string) {
  const baseUrl = `${API_BASE_URL}${API_PATHS.prefix}${resource}`;

  return {
    list: (params?: Record<string, string>, signal?: AbortSignal) =>
      apiRequest<TItem[]>(`${baseUrl}${params ? `?${new URLSearchParams(params)}` : ""}`, { signal, cache: "no-store" }),
    get: (id: string) => apiRequest<TItem>(`${baseUrl}/${encodeURIComponent(id)}`),
    create: (payload: TCreate) => apiRequest<TItem>(baseUrl, { method: "POST", body: JSON.stringify(payload) }),
    update: (id: string, payload: TUpdate) => apiRequest<TItem>(`${baseUrl}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) }),
    remove: (id: string) => apiRequest<{ success: boolean }>(`${baseUrl}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}
