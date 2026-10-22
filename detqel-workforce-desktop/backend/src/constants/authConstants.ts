export const AUTHORIZATION_HEADER = "Authorization";
export const BEARER_AUTHORIZATION_PREFIX = "Bearer ";
export const BASIC_AUTHORIZATION_PREFIX = "Basic ";
export const MAX_AUTHORIZATION_HEADER_LENGTH = 4_096;
export const DESKTOP_TOKEN_HEADER = "x-detqel-desktop-token";
export const PASSWORD_HASH_ALGORITHM = "sha256";
export const SESSION_CRYPTO = {
    algorithm: "sha256",
    keyBytes: 32,
    nonceBytes: 16,
    encoding: "base64url",
    millisecondsPerSecond: 1_000,
} as const;
