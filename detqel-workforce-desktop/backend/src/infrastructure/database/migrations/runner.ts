import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { DATABASE_ADMIN_OPTIONS, DATABASE_MIGRATIONS } from "../../../constants/databaseConstants.js";
export const defaultMigrationsFolder = fileURLToPath(new URL(DATABASE_MIGRATIONS.relativeDirectory, import.meta.url));
export async function runMigrations(databaseUrl: string, migrationsFolder = defaultMigrationsFolder): Promise<void> {
    // Missing migration artifacts must fail deployment, never silently skip schema changes.
    await access(path.join(migrationsFolder, DATABASE_MIGRATIONS.metadataDirectory, DATABASE_MIGRATIONS.journalFile));
    const files = readMigrationFiles({ migrationsFolder });
    const client = postgres(databaseUrl, { max: DATABASE_ADMIN_OPTIONS.maximumConnections, connect_timeout: DATABASE_ADMIN_OPTIONS.connectTimeoutSeconds, onnotice: () => { } });
    let locked = false;
    try {
        await client `SELECT set_config('lock_timeout', ${DATABASE_MIGRATIONS.lockTimeout}, false)`;
        await client `SELECT pg_advisory_lock(${DATABASE_MIGRATIONS.lockNamespace}, ${DATABASE_MIGRATIONS.lockId})`;
        locked = true;
        const [table] = await client `SELECT to_regclass('drizzle.__drizzle_migrations') AS name`;
        if (table?.name) {
            const applied = await client<{
                hash: string;
                created_at: string;
            }[]> `SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
            for (let index = 0; index < applied.length; index++) {
                const file = files[index], row = applied[index];
                if (!file || file.folderMillis !== Number(row.created_at) || file.hash !== row.hash) {
                    throw new Error("Migration history does not match the committed SQL files. Restore the original files and add a new migration.");
                }
            }
        }
        await migrate(drizzle(client), { migrationsFolder });
    }
    finally {
        try {
            if (locked)
                await client `SELECT pg_advisory_unlock(${DATABASE_MIGRATIONS.lockNamespace}, ${DATABASE_MIGRATIONS.lockId})`;
        }
        finally {
            await client.end({ timeout: DATABASE_ADMIN_OPTIONS.closeTimeoutSeconds });
        }
    }
}
