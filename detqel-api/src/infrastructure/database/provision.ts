import postgres from "postgres";
export async function initializeDatabase(databaseUrl: string, adminDatabaseUrl?: string): Promise<void> {
    const url = new URL(databaseUrl);
    const name = decodeURIComponent(url.pathname.slice(1));
    if (!name || Buffer.byteLength(name) > 63 || name.includes("\0"))
        throw new Error("Invalid PostgreSQL database name");
    const maintenanceUrl = new URL(adminDatabaseUrl ?? databaseUrl);
    if (!adminDatabaseUrl)
        maintenanceUrl.pathname = "/postgres";
    const client = postgres(maintenanceUrl.toString(), { max: 1, connect_timeout: 10, onnotice: () => { } });
    try {
        const existing = await client `SELECT 1 FROM pg_database WHERE datname = ${name}`;
        if (!existing.length) {
            try {
                await client `CREATE DATABASE ${client(name)}`;
            }
            catch (error) {
                if ((error as {
                    code?: string;
                }).code !== "42P04")
                    throw error;
            }
        }
    }
    finally {
        await client.end({ timeout: 5 });
    }
}
