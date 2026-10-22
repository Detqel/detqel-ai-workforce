import { AUTH_STORAGE_KEYS } from "@/constants/authConstants";

export function storeAccessToken(accessToken: string): void {
  sessionStorage.setItem(AUTH_STORAGE_KEYS.accessToken, accessToken);
}

export function readAccessToken(): string | null {
  return typeof window === "undefined" ? null : sessionStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);
}
