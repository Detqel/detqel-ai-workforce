import { buildApp } from "./app.js";
import { env } from "./config/env.js";
async function main() {
    const app = await buildApp({ verifyDatabase: true });
    try {
        await app.services.health.check().then(health => {
            if (health.database !== "connected")
                throw new Error("Database unavailable. Provision the database and run db:migrate before starting the API.");
        });
        const address = await app.listen({ port: env.PORT, host: env.HOST });
        app.log.info(`DETQEL Workforce API listening at ${address}`);
    }
    catch (error) {
        await app.close();
        throw error;
    }
    let stopping = false;
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.once(signal, () => {
            if (stopping)
                return;
            stopping = true;
            app.log.info({ signal }, "Shutting down");
            app.close().catch(error => {
                app.log.error(error);
                process.exitCode = 1;
            });
        });
    }
}
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
