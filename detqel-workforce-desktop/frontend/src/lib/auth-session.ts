const SESSION_KEY = "detqel_access_token";

export function storeAccessToken(accessToken: string): void {
  sessionStorage.setItem(SESSION_KEY, accessToken);
}

export function readAccessToken(): string | null {
  return typeof window === "undefined" ? null : sessionStorage.getItem(SESSION_KEY);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
