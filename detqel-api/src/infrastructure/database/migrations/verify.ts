import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { AppDatabase } from "../connection.js";
import { defaultMigrationsFolder } from "./runner.js";

export async function verifyMigrationState(database: AppDatabase): Promise<void> {
  const files = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder });
  const [table] = await database.execute(sql`SELECT to_regclass('drizzle.__drizzle_migrations') AS name`);
  if (!table?.name) throw new Error("Database is not initialized. Run npm run db:migrate before starting the API.");
  const applied = await database.execute(sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`);
  if (applied.length > files.length || applied.some((row, index) => row.hash !== files[index].hash || Number(row.created_at) !== files[index].folderMillis)) {
    throw new Error("Database migration history is inconsistent with the committed files. Restore the original migration files before starting the API.");
  }
  if (applied.length < files.length) {
    throw new Error(`Database migrations are out of date: ${files.length - applied.length} pending migration(s). Run npm run db:migrate before starting the API.`);
  }
}
