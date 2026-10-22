import { FRONTEND_ORIGINS, LOOPBACK_HOST, SERVICE_PORTS } from "./networkConstants.js";

export const NODE_ENVIRONMENTS = ["development", "test", "production"] as const;
export const BACKEND_ENV_FILE = "../../.env";
export const ENCODED_SECRET_MINIMUM_LENGTH = 43;

export const ENVIRONMENT_DEFAULTS = {
    port: SERVICE_PORTS.api,
    host: LOOPBACK_HOST,
    nodeEnvironment: NODE_ENVIRONMENTS[0],
    corsOrigin: FRONTEND_ORIGINS.join(","),
    databasePoolMax: 10,
    databaseIdleTimeoutSeconds: 20,
    databaseConnectTimeoutSeconds: 10,
} as const;

export const PROVIDER_ENDPOINTS = {
    openai: { models: "https://api.openai.com/v1/models", chat: "https://api.openai.com/v1/chat/completions" },
    groq: { models: "https://api.groq.com/openai/v1/models", chat: "https://api.groq.com/openai/v1/chat/completions" },
    deepseek: { models: "https://api.deepseek.com/models", chat: "https://api.deepseek.com/chat/completions" },
    anthropic: { models: "https://api.anthropic.com/v1/models", messages: "https://api.anthropic.com/v1/messages" },
    google: { models: "https://generativelanguage.googleapis.com/v1beta/models", generate: "https://generativelanguage.googleapis.com/v1beta/models" },
} as const;
