import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
export const defaultMigrationsFolder = fileURLToPath(new URL("../../../../drizzle/", import.meta.url));
export async function runMigrations(databaseUrl: string, migrationsFolder = defaultMigrationsFolder): Promise<void> {
    // Missing migration artifacts must fail deployment, never silently skip schema changes.
    await access(path.join(migrationsFolder, "meta", "_journal.json"));
    const files = readMigrationFiles({ migrationsFolder });
    const client = postgres(databaseUrl, { max: 1, connect_timeout: 10, onnotice: () => { } });
    let locked = false;
    try {
        await client `SET lock_timeout = '30s'`;
        await client `SELECT pg_advisory_lock(1732401, 1)`;
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
                await client `SELECT pg_advisory_unlock(1732401, 1)`;
        }
        finally {
            await client.end({ timeout: 5 });
        }
    }
}
