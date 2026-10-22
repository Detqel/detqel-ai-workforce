import postgres from "postgres";
import { DATABASE_ADMIN_OPTIONS, DATABASE_ERROR_CODES } from "../../constants/databaseConstants.js";
export async function initializeDatabase(databaseUrl: string, adminDatabaseUrl?: string): Promise<void> {
    const url = new URL(databaseUrl);
    const name = decodeURIComponent(url.pathname.slice(1));
    if (!name || Buffer.byteLength(name) > DATABASE_ADMIN_OPTIONS.maximumNameBytes || name.includes("\0"))
        throw new Error("Invalid PostgreSQL database name");
    const maintenanceUrl = new URL(adminDatabaseUrl ?? databaseUrl);
    if (!adminDatabaseUrl)
        maintenanceUrl.pathname = `/${DATABASE_ADMIN_OPTIONS.maintenanceDatabase}`;
    const client = postgres(maintenanceUrl.toString(), { max: DATABASE_ADMIN_OPTIONS.maximumConnections, connect_timeout: DATABASE_ADMIN_OPTIONS.connectTimeoutSeconds, onnotice: () => { } });
    try {
        const existing = await client `SELECT 1 FROM pg_database WHERE datname = ${name}`;
        if (!existing.length) {
            try {
                await client `CREATE DATABASE ${client(name)}`;
            }
            catch (error) {
                if ((error as {
                    code?: string;
                }).code !== DATABASE_ERROR_CODES.duplicateDatabase)
                    throw error;
            }
        }
    }
    finally {
        await client.end({ timeout: DATABASE_ADMIN_OPTIONS.closeTimeoutSeconds });
    }
}
