import dotenv from 'dotenv';
import postgres from 'postgres';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: path.join(root, '.env') });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, onnotice: () => {} });
try {
  const snapshot = await client.begin(async tx => {
    await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
    const [{ name }] = await tx`SELECT current_database() AS name`;
    const tables = await tx`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
    const data = {};
    for (const { tablename } of tables) {
      const rows = await tx`SELECT to_jsonb(record) AS data FROM ${tx('public')}.${tx(tablename)} record`;
      data[tablename] = rows.map(row => row.data);
    }
    const history = await tx`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    return { capturedAt: new Date().toISOString(), database: name, migrationHistory: history, tables: data };
  });
  const directory = path.join(root, '.local', 'database-backups');
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `pre-upgrade-${Date.now()}.json`);
  await writeFile(file, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(`Database row snapshot saved to ${path.relative(root, file)}`);
} finally { await client.end({ timeout: 5 }); }
