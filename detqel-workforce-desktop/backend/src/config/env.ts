import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
    BACKEND_ENV_FILE,
    ENCODED_SECRET_MINIMUM_LENGTH,
    ENVIRONMENT_DEFAULTS,
    NODE_ENVIRONMENTS,
    PROVIDER_ENDPOINTS,
} from "../constants/configurationConstants.js";
import { MAXIMUM_TCP_PORT, POSTGRESQL_PROTOCOLS } from "../constants/networkConstants.js";
import { LICENSE_PORTAL_DEFAULTS, LICENSE_PORTAL_INSECURE_HOSTS } from "../constants/licenseConstants.js";
if (!process.env.DETQEL_DESKTOP) dotenv.config({ path: fileURLToPath(new URL(BACKEND_ENV_FILE, import.meta.url)) });
export const envSchema = z.object({
    LITELLM_BASE_URL: z.string().url().optional(),
    LITELLM_API_KEY: z.string().min(1).optional(),
    MILVUS_ADDRESS: z.string().url().optional(),
    MILVUS_TOKEN: z.string().min(1).optional(),
    OLLAMA_BASE_URL: z.string().url().optional(),
    OLLAMA_EMBEDDING_MODEL: z.string().min(1).optional(),
    AUTH_SESSION_SECRET: z.string().min(ENCODED_SECRET_MINIMUM_LENGTH),
    AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive(),
    CONNECTOR_ENCRYPTION_KEY: z.string().min(ENCODED_SECRET_MINIMUM_LENGTH),
    CONNECTOR_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive(),
    CONNECTOR_ALLOWED_COMMANDS: z.string().transform(value => JSON.parse(value) as unknown).pipe(z.array(z.string().min(1))),
    CONNECTOR_ALLOWED_ROOTS: z.string().transform(value => JSON.parse(value) as unknown).pipe(z.array(z.string().min(1))),
    PORT: z.coerce.number().int().min(process.env.DETQEL_DESKTOP ? 0 : 1).max(MAXIMUM_TCP_PORT).default(ENVIRONMENT_DEFAULTS.port),
    HOST: z.string().min(1).default(ENVIRONMENT_DEFAULTS.host),
    NODE_ENV: z.enum(NODE_ENVIRONMENTS).default(ENVIRONMENT_DEFAULTS.nodeEnvironment),
    DATABASE_URL: z.string().url().refine(value => { const url = new URL(value); return POSTGRESQL_PROTOCOLS.some(protocol => protocol === url.protocol) && url.pathname.length > 1; }, "DATABASE_URL must be a PostgreSQL URL with a database name"),
    CORS_ORIGIN: z.string().min(1).default(ENVIRONMENT_DEFAULTS.corsOrigin),
    LICENSE_PORTAL_URL: z.string().url().default(LICENSE_PORTAL_DEFAULTS.url).refine(value => {
        const url = new URL(value);
        return url.protocol === "https:" || (url.protocol === "http:" && LICENSE_PORTAL_INSECURE_HOSTS.includes(url.hostname));
    }, "LICENSE_PORTAL_URL must use HTTPS unless it points to this machine"),
    // Issued by the portal with `npm run product:key -- --product kin`. Sign-in and registration are refused without it.
    LICENSE_PORTAL_PRODUCT_KEY: z.preprocess(value => value === "" ? undefined : value, z.string().regex(/^dpk_[A-Za-z0-9_-]{43}$/, "LICENSE_PORTAL_PRODUCT_KEY must be a dpk_ key issued by the License Portal").optional()),
    LICENSE_PORTAL_ISSUER: z.string().min(1).default(LICENSE_PORTAL_DEFAULTS.issuer),
    LICENSE_PORTAL_AUDIENCE: z.string().min(1).default(LICENSE_PORTAL_DEFAULTS.audience),
    LICENSE_PORTAL_TIMEOUT_MS: z.coerce.number().int().positive().default(LICENSE_PORTAL_DEFAULTS.timeoutMs),
    DB_POOL_MAX: z.coerce.number().int().positive().default(ENVIRONMENT_DEFAULTS.databasePoolMax),
    DB_IDLE_TIMEOUT: z.coerce.number().int().positive().default(ENVIRONMENT_DEFAULTS.databaseIdleTimeoutSeconds),
    DB_CONNECT_TIMEOUT: z.coerce.number().int().positive().default(ENVIRONMENT_DEFAULTS.databaseConnectTimeoutSeconds),

    // AI Provider Model Endpoint URLs
    OPENAI_MODELS_URL: z.string().url().default(PROVIDER_ENDPOINTS.openai.models),
    GROQ_MODELS_URL: z.string().url().default(PROVIDER_ENDPOINTS.groq.models),
    DEEPSEEK_MODELS_URL: z.string().url().default(PROVIDER_ENDPOINTS.deepseek.models),
    ANTHROPIC_MODELS_URL: z.string().url().default(PROVIDER_ENDPOINTS.anthropic.models),
    GOOGLE_MODELS_URL: z.string().url().default(PROVIDER_ENDPOINTS.google.models),

    // AI Provider Chat/Execution Endpoint URLs
    OPENAI_CHAT_URL: z.string().url().default(PROVIDER_ENDPOINTS.openai.chat),
    GROQ_CHAT_URL: z.string().url().default(PROVIDER_ENDPOINTS.groq.chat),
    DEEPSEEK_CHAT_URL: z.string().url().default(PROVIDER_ENDPOINTS.deepseek.chat),
    ANTHROPIC_MESSAGES_URL: z.string().url().default(PROVIDER_ENDPOINTS.anthropic.messages),
    GOOGLE_GENERATE_URL: z.string().url().default(PROVIDER_ENDPOINTS.google.generate),
});
export type Environment = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
