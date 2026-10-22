import { LOCALHOST_HOST, SERVICE_PORTS } from "./networkConstants.js";

export const AI_PROVIDER_IDS = {
    openai: "openai", groq: "groq", deepseek: "deepseek", anthropic: "anthropic", google: "google", custom: "custom",
} as const;
export const MODEL_DISCOVERY_TIMEOUT_MS = 10_000;
export const PROMPT_EXECUTION_TIMEOUT_MS = 35_000;
export const PROVIDER_ERROR_PREVIEW_LENGTH = 250;
export const ANTHROPIC_API_VERSION = "2023-06-01";
export const ANTHROPIC_HEADERS = { apiKey: "x-api-key", version: "anthropic-version" } as const;
export const ANTHROPIC_MAX_OUTPUT_TOKENS = 2_048;
export const LOCAL_OLLAMA_CHAT_URL = `http://${LOCALHOST_HOST}:${SERVICE_PORTS.ollama}/v1/chat/completions`;
