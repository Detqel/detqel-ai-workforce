import { env } from "../../config/env.js";
import { createDatabase } from "./connection.js";
import { runMigrations } from "./migrations/runner.js";
import { initializeDatabase } from "./provision.js";
import { seedDemoData } from "./seeds/demo.seed.js";
import { seedReferenceData } from "./seeds/reference.seed.js";
async function main() {
    const command = process.argv[2];
    if (!["init", "migrate", "seed", "seed-demo", "setup"].includes(command))
        throw new Error("Use init, migrate, seed, seed-demo, or setup");
    if (command === "seed-demo" && env.NODE_ENV === "production")
        throw new Error("Demo seeding is disabled in production");
    if (command === "init" || command === "setup")
        await initializeDatabase(env.DATABASE_URL, process.env.DATABASE_ADMIN_URL);
    if (command === "migrate" || command === "setup")
        await runMigrations(env.DATABASE_URL);
    if (["seed", "seed-demo", "setup"].includes(command)) {
        const connection = createDatabase(env);
        try {
            await seedReferenceData(connection.db);
            if (command === "seed-demo")
                await seedDemoData(connection.db);
        }
        finally {
            await connection.close();
        }
    }
    console.log(`Database ${command} completed successfully`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
