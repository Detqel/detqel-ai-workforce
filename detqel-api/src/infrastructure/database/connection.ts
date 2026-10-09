import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";
export type AppDatabase = PostgresJsDatabase<typeof schema>;
export type AppTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
export type DatabaseSession = AppDatabase | AppTransaction;
export interface DatabaseConfig {
    DATABASE_URL: string;
    DB_POOL_MAX: number;
    DB_IDLE_TIMEOUT: number;
    DB_CONNECT_TIMEOUT: number;
}
export function createDatabase(config: DatabaseConfig) {
    const client = postgres(config.DATABASE_URL, { max: config.DB_POOL_MAX, idle_timeout: config.DB_IDLE_TIMEOUT, connect_timeout: config.DB_CONNECT_TIMEOUT, onnotice: () => { } });
    return {
        db: drizzle(client, { schema }),
        check: async () => { await client `SELECT 1`; },
        close: async () => { await client.end({ timeout: 5 }); },
    };
}
export type DatabaseConnection = ReturnType<typeof createDatabase>;
