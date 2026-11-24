import { AI_PROVIDER_IDS } from "./settingsConstants.js";

// Provider catalog metadata only. Credentials, connection state, and discovered models belong to users.
export const INITIAL_AI_PROVIDERS = [
    { id: AI_PROVIDER_IDS.openai, name: "OpenAI", iconKey: AI_PROVIDER_IDS.openai, description: "Connect to OpenAI models.", sortOrder: 0 },
    { id: AI_PROVIDER_IDS.anthropic, name: "Anthropic", iconKey: AI_PROVIDER_IDS.anthropic, description: "Connect to Anthropic Claude models.", sortOrder: 1 },
    { id: AI_PROVIDER_IDS.google, name: "Google", iconKey: AI_PROVIDER_IDS.google, description: "Connect to Google Gemini models.", sortOrder: 2 },
    { id: AI_PROVIDER_IDS.groq, name: "Groq", iconKey: AI_PROVIDER_IDS.groq, description: "Connect to models hosted by Groq.", sortOrder: 3 },
    { id: AI_PROVIDER_IDS.deepseek, name: "DeepSeek", iconKey: AI_PROVIDER_IDS.deepseek, description: "Connect to DeepSeek models.", sortOrder: 4 },
    { id: AI_PROVIDER_IDS.custom, name: "Custom", iconKey: AI_PROVIDER_IDS.custom, description: "Connect to a custom OpenAI-compatible endpoint.", sortOrder: 5 },
];

export const INITIAL_DOMAINS = ["Retail & E-Commerce", "Technology & SaaS", "Finance & Banking", "Healthcare & Pharma", "Logistics & Supply Chain", "Manufacturing", "Agency & Professional Services"];
export const DEMO_ACTIVITY_DAY_MS = 86_400_000;
