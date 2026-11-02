import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { AppDatabase } from "../connection.js";
import { defaultMigrationsFolder, isMigrationHashCompatible, readJournalTags } from "./runner.js";

export async function verifyMigrationState(database: AppDatabase): Promise<void> {
  const files = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder });
  const [table] = await database.execute(sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS name`);
  if (!table?.name) throw new Error("Database is not initialized. Run npm run db:migrate before starting the API.");
  const applied = await database.execute(sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`);
  if (applied.length > files.length) {
    throw new Error(`Database has ${applied.length} migrations applied, but only ${files.length} committed migration files exist.`);
  }
  const tags = readJournalTags(defaultMigrationsFolder);
  for (let index = 0; index < applied.length; index++) {
    const row = applied[index] as { hash: string; created_at: string };
    const file = files[index];
    const tag = tags[index];
    if (!file || Number(row.created_at) !== file.folderMillis) {
      throw new Error(`Database migration history timestamp mismatch at index ${index} (${tag ?? "unknown"}). Database created_at=${row?.created_at}, file folderMillis=${file?.folderMillis}.`);
    }
    if (row.hash !== file.hash && !isMigrationHashCompatible(file, row, defaultMigrationsFolder, tag)) {
      throw new Error(`Database migration history is inconsistent with committed file at index ${index} (${tag ?? "unknown"}). Committed file hash is ${file.hash}, database hash is ${row.hash}.`);
    }
  }
  if (applied.length < files.length) {
    throw new Error(`Database migrations are out of date: ${files.length - applied.length} pending migration(s). Run npm run db:migrate before starting the API.`);
  }
}
