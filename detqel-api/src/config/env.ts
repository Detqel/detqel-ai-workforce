import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
export const envSchema = z.object({
    AUTH_SESSION_SECRET: z.string().min(43),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive(),
    CONNECTOR_ENCRYPTION_KEY: z.string().min(43),
    CONNECTOR_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive(),
    CONNECTOR_ALLOWED_COMMANDS: z.string().transform(value => JSON.parse(value) as unknown).pipe(z.array(z.string().min(1))),
    CONNECTOR_ALLOWED_ROOTS: z.string().transform(value => JSON.parse(value) as unknown).pipe(z.array(z.string().min(1))),
    PORT: z.coerce.number().int().min(1).max(65535).default(8100),
    HOST: z.string().min(1).default("127.0.0.1"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url().refine(value => { const url = new URL(value); return ["postgres:", "postgresql:"].includes(url.protocol) && url.pathname.length > 1; }, "DATABASE_URL must be a PostgreSQL URL with a database name"),
    CORS_ORIGIN: z.string().min(1).default("http://127.0.0.1:3100,http://localhost:3100"),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_IDLE_TIMEOUT: z.coerce.number().int().positive().default(20),
    DB_CONNECT_TIMEOUT: z.coerce.number().int().positive().default(10),

    // AI Provider Model Endpoint URLs
    OPENAI_MODELS_URL: z.string().url().default("https://api.openai.com/v1/models"),
    GROQ_MODELS_URL: z.string().url().default("https://api.groq.com/openai/v1/models"),
    DEEPSEEK_MODELS_URL: z.string().url().default("https://api.deepseek.com/models"),
    ANTHROPIC_MODELS_URL: z.string().url().default("https://api.anthropic.com/v1/models"),
    GOOGLE_MODELS_URL: z.string().url().default("https://generativelanguage.googleapis.com/v1beta/models"),

    // AI Provider Chat/Execution Endpoint URLs
    OPENAI_CHAT_URL: z.string().url().default("https://api.openai.com/v1/chat/completions"),
    GROQ_CHAT_URL: z.string().url().default("https://api.groq.com/openai/v1/chat/completions"),
    DEEPSEEK_CHAT_URL: z.string().url().default("https://api.deepseek.com/chat/completions"),
    ANTHROPIC_MESSAGES_URL: z.string().url().default("https://api.anthropic.com/v1/messages"),
    GOOGLE_GENERATE_URL: z.string().url().default("https://generativelanguage.googleapis.com/v1beta/models"),
});
export type Environment = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
