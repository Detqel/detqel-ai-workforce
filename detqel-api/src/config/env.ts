import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
export const envSchema = z.object({
    PORT: z.coerce.number().int().min(1).max(65535).default(8100),
    HOST: z.string().min(1).default("127.0.0.1"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url().refine(value => { const url = new URL(value); return ["postgres:", "postgresql:"].includes(url.protocol) && url.pathname.length > 1; }, "DATABASE_URL must be a PostgreSQL URL with a database name"),
    CORS_ORIGIN: z.string().min(1).default("http://127.0.0.1:3100,http://localhost:3100"),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_IDLE_TIMEOUT: z.coerce.number().int().positive().default(20),
    DB_CONNECT_TIMEOUT: z.coerce.number().int().positive().default(10),
});
export type Environment = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
