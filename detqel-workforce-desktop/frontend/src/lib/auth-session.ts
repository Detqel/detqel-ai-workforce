import { AUTH_STORAGE_KEYS } from "@/constants/authConstants";
import { API_BASE_URL, API_PATHS } from "@/constants/apiConstants";
import { desktopFetch } from "@/lib/desktop";

/** Fired when the server rejects the session and it cannot be renewed, so the app can return to sign in. */
export const SESSION_EXPIRED_EVENT = "detqel:session-expired";

export function storeAccessToken(accessToken: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, accessToken);
    sessionStorage.setItem(AUTH_STORAGE_KEYS.accessToken, accessToken);
  } catch {
    // Gracefully ignore storage quota or access issues
  }
}

export function readAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return (
      localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) ??
      sessionStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    );
  } catch {
    return null;
  }
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);
    sessionStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);
  } catch {
    // Gracefully ignore storage removal issues
  }
}

export function announceSessionExpired(): void {
  clearAccessToken();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

/**
 * Exchanges the current session for a fresh one. The server identifies the user from the token itself, so a
 * session that has expired cannot be renewed and the user must sign in again.
 * Returns the new token, or null when the session could not be renewed.
 */
export async function refreshSession(): Promise<string | null> {
  const token = readAccessToken();
  if (!token) return null;
  const res = await desktopFetch(`${API_BASE_URL}${API_PATHS.authMe}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Failed to renew session");
  if (typeof data.accessToken !== "string" || data.accessToken.length === 0) throw new Error("No access token returned from session endpoint");
  storeAccessToken(data.accessToken);
  return data.accessToken;
}

/**
 * fetch for the application API: sends the session token and, if the server says the session is no longer
 * valid, tries to renew it once before giving up and asking the user to sign in again.
 */
export async function authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return desktopFetch(url, { ...init, headers });
  };
  const token = readAccessToken();
  const response = await send(token);
  if (response.status !== 401) return response;
  const renewed = token ? await refreshSession().catch(() => null) : null;
  if (!renewed) {
    announceSessionExpired();
    return response;
  }
  return send(renewed);
}
