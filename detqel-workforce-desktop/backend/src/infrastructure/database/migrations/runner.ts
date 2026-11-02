import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { DATABASE_ADMIN_OPTIONS, DATABASE_MIGRATIONS } from "../../../constants/databaseConstants.js";
export const defaultMigrationsFolder = fileURLToPath(new URL(DATABASE_MIGRATIONS.relativeDirectory, import.meta.url));

export function readJournalTags(migrationsFolder: string): string[] {
    try {
        const journalPath = path.join(migrationsFolder, DATABASE_MIGRATIONS.metadataDirectory, DATABASE_MIGRATIONS.journalFile);
        const parsed = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
        return parsed.entries.map(e => e.tag);
    } catch {
        return [];
    }
}

export function isMigrationHashCompatible(
    file: { hash: string; folderMillis: number; sql?: string[] },
    row: { hash: string; created_at: string },
    migrationsFolder: string,
    tag?: string
): boolean {
    if (file.hash === row.hash) return true;
    if (file.folderMillis !== Number(row.created_at)) return false;
    try {
        let content: string | undefined;
        if (tag) {
            const sqlPath = path.join(migrationsFolder, `${tag}.sql`);
            if (existsSync(sqlPath)) {
                content = readFileSync(sqlPath, "utf8");
            }
        }
        if (!content && file.sql?.length) {
            content = file.sql.join("--> statement-breakpoint");
        }
        if (!content) return false;

        const lf = content.replace(/\r\n/g, "\n");
        const crlf = lf.replace(/\n/g, "\r\n");
        const candidates = [
            createHash("sha256").update(lf).digest("hex"),
            createHash("sha256").update(crlf).digest("hex"),
            createHash("sha256").update(lf.trimEnd()).digest("hex"),
            createHash("sha256").update(lf.trimEnd() + "\n").digest("hex"),
            createHash("sha256").update(crlf.trimEnd() + "\r\n").digest("hex"),
        ];
        return candidates.includes(row.hash);
    } catch {
        return false;
    }
}

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
            const tags = readJournalTags(migrationsFolder);
            for (let index = 0; index < applied.length; index++) {
                const file = files[index], row = applied[index];
                if (!file || file.folderMillis !== Number(row.created_at)) {
                    throw new Error(`Migration history timestamp mismatch at index ${index}. Database created_at=${row?.created_at}, file folderMillis=${file?.folderMillis}.`);
                }
                if (file.hash !== row.hash) {
                    const tag = tags[index];
                    if (isMigrationHashCompatible(file, row, migrationsFolder, tag)) {
                        await client`UPDATE drizzle.__drizzle_migrations SET hash = ${file.hash} WHERE created_at = ${row.created_at}`;
                    } else {
                        throw new Error(`Migration history does not match committed SQL file at index ${index} (${tag ?? "unknown"}). Committed file hash is ${file.hash}, but database has ${row.hash}. Restore the original file and add a new migration.`);
                    }
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
