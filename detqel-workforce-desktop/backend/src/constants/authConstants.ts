export const AUTHORIZATION_HEADER = "Authorization";
export const BEARER_AUTHORIZATION_PREFIX = "Bearer ";
export const BASIC_AUTHORIZATION_PREFIX = "Basic ";
export const MAX_AUTHORIZATION_HEADER_LENGTH = 4_096;
export const DESKTOP_TOKEN_HEADER = "x-detqel-desktop-token";
export const PASSWORD_HASH_ALGORITHM = "sha256";
// Authenticated encryption for stored third-party credentials (AI provider keys). Each purpose derives its own
// subkey from the installation's master key, so a ciphertext from one purpose can never be decrypted as another.
export const SECRET_CRYPTO = {
    algorithm: "aes-256-gcm",
    keyBytes: 32,
    ivBytes: 12,
    encoding: "base64url",
    envelopePrefix: "secret",
    envelopeVersion: "v1",
    envelopeSeparator: ":",
    derivation: { digest: "sha256", salt: "detqel.secret-cipher.v1" },
} as const;
export const SECRET_PURPOSES = { aiProviderCredentials: "ai-provider-credentials" } as const;
// Shown only as the last characters of a stored key so users can recognise which key is saved.
export const SECRET_HINT = { visibleCharacters: 4, minimumLength: 12 } as const;
export const SESSION_CRYPTO = {
    algorithm: "sha256",
    keyBytes: 32,
    nonceBytes: 16,
    encoding: "base64url",
    millisecondsPerSecond: 1_000,
} as const;
