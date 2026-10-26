export const testEnvironment = {
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  NODE_ENV: "test",
  AUTH_SESSION_SECRET: Buffer.alloc(32, 1).toString("base64"),
  AUTH_SESSION_TTL_SECONDS: "3600",
  CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
  CONNECTOR_REQUEST_TIMEOUT_MS: "1000",
  CONNECTOR_ALLOWED_COMMANDS: "[]",
  CONNECTOR_ALLOWED_ROOTS: "[]",
};

// Keep configuration validation in tests independent of a developer's private .env.
for (const [key, value] of Object.entries(testEnvironment)) process.env[key] ??= value;
