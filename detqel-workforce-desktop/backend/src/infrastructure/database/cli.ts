import { env } from "../../config/env.js";
import { DATABASE_COMMANDS } from "../../constants/databaseConstants.js";
import { createDatabase } from "./connection.js";
import { runMigrations } from "./migrations/runner.js";
import { initializeDatabase } from "./provision.js";
import { seedDemoData } from "./seeds/demo.seed.js";
import { seedReferenceData } from "./seeds/reference.seed.js";
async function main() {
    const command = process.argv[2];
    if (!(Object.values(DATABASE_COMMANDS) as readonly string[]).includes(command))
        throw new Error("Use init, migrate, seed, seed-demo, or setup");
    if (command === DATABASE_COMMANDS.seedDemo && env.NODE_ENV === "production")
        throw new Error("Demo seeding is disabled in production");
    if (command === DATABASE_COMMANDS.initialize || command === DATABASE_COMMANDS.setup)
        await initializeDatabase(env.DATABASE_URL, process.env.DATABASE_ADMIN_URL);
    if (command === DATABASE_COMMANDS.migrate || command === DATABASE_COMMANDS.setup)
        await runMigrations(env.DATABASE_URL);
    if (([DATABASE_COMMANDS.seed, DATABASE_COMMANDS.seedDemo, DATABASE_COMMANDS.setup] as readonly string[]).includes(command)) {
        const connection = createDatabase(env);
        try {
            await seedReferenceData(connection.db);
            if (command === DATABASE_COMMANDS.seedDemo)
                await seedDemoData(connection.db);
        }
        finally {
            await connection.close();
        }
    }
    console.log(`Database ${command} completed successfully`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
