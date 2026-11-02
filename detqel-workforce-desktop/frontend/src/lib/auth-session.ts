import { AUTH_STORAGE_KEYS } from "@/constants/authConstants";
import { API_BASE_URL, API_PATHS } from "@/constants/apiConstants";
import { desktopFetch } from "@/lib/desktop";

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

export async function restoreSession(userId: string): Promise<string> {
  const url = `${API_BASE_URL}${API_PATHS.authMe}?userId=${encodeURIComponent(userId)}`;
  const res = await desktopFetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Failed to restore session");
  }
  if (typeof data.accessToken === "string" && data.accessToken.length > 0) {
    storeAccessToken(data.accessToken);
    return data.accessToken;
  }
  throw new Error("No access token returned from session endpoint");
}
