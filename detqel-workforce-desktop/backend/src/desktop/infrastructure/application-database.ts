import { createDatabase } from "../../infrastructure/database/connection.js";
import { runMigrations } from "../../infrastructure/database/migrations/runner.js";
import { verifyMigrationState } from "../../infrastructure/database/migrations/verify.js";
import { seedReferenceData } from "../../infrastructure/database/seeds/reference.seed.js";
import {
    APPLICATION_DATABASE_PHASES,
    APPLICATION_DATABASE_STARTUP_SETTINGS,
    DOCKER_PROTOCOLS,
    DOCKER_VALIDATION,
} from "../../constants/dockerConstants.js";
import { LOOPBACK_HOST, PRIVATE_PORT_RANGE } from "../../constants/networkConstants.js";
import { DesktopInfrastructureError } from "./infrastructure-error.js";

export interface ApplicationDatabaseOptions {
    /** The managed container URL. Never pass or rewrite the user's legacy DATABASE_URL. */
    databaseUrl: string;
    signal: AbortSignal;
    report: (detail: string) => void;
}

function assertManagedDatabaseUrl(value: string): void {
    let url: URL;
    try { url = new URL(value); }
    catch { throw new DesktopInfrastructureError("The managed application database address is invalid."); }
    const port = Number(url.port);
    if (!(DOCKER_PROTOCOLS.database as readonly string[]).includes(url.protocol)
        || url.hostname !== LOOPBACK_HOST
        || !Number.isInteger(port) || port < PRIVATE_PORT_RANGE.minimum || port > PRIVATE_PORT_RANGE.maximum
        || !url.username || !url.password
        || !DOCKER_VALIDATION.databasePath.test(url.pathname)
        || url.search || url.hash) {
        throw new DesktopInfrastructureError("The application database must use its authenticated, private managed PostgreSQL endpoint.");
    }
}

function assertStartupActive(signal: AbortSignal): void {
    if (signal.aborted) throw new DesktopInfrastructureError("Desktop application database startup was cancelled.");
}

/** Applies additive application migrations and idempotent reference seeds to the managed database only. */
export async function prepareApplicationDatabase(options: ApplicationDatabaseOptions): Promise<void> {
    assertManagedDatabaseUrl(options.databaseUrl);
    assertStartupActive(options.signal);
    const connection = createDatabase({
        DATABASE_URL: options.databaseUrl,
        DB_POOL_MAX: APPLICATION_DATABASE_STARTUP_SETTINGS.poolMaximum,
        DB_IDLE_TIMEOUT: APPLICATION_DATABASE_STARTUP_SETTINGS.idleTimeoutSeconds,
        DB_CONNECT_TIMEOUT: APPLICATION_DATABASE_STARTUP_SETTINGS.connectTimeoutSeconds,
    });
    let phase: typeof APPLICATION_DATABASE_PHASES[keyof typeof APPLICATION_DATABASE_PHASES] = APPLICATION_DATABASE_PHASES.connect;
    try {
        options.report("Verifying access to the managed application PostgreSQL database...");
        await connection.check();
        assertStartupActive(options.signal);

        phase = APPLICATION_DATABASE_PHASES.migrate;
        options.report("Applying application database migrations...");
        await runMigrations(options.databaseUrl);
        assertStartupActive(options.signal);

        phase = APPLICATION_DATABASE_PHASES.seed;
        options.report("Preparing connector catalog and application reference data...");
        await seedReferenceData(connection.db);
        assertStartupActive(options.signal);

        phase = APPLICATION_DATABASE_PHASES.verify;
        options.report("Verifying the managed application's migration history...");
        await verifyMigrationState(connection.db);
        assertStartupActive(options.signal);
    } catch (error) {
        if (error instanceof DesktopInfrastructureError) throw error;
        const messages = {
            connect: "The managed application database rejected its authenticated startup check. Check the application database container and its saved private credentials.",
            migrate: "The managed application database could not apply its migrations. Check its availability and committed migration history; the database has not been reset.",
            seed: "The managed application database could not prepare application reference data. Check its availability and restart the application.",
            verify: "The managed application database migration history could not be verified. Restore the committed migration files before restarting the application.",
        };
        throw new DesktopInfrastructureError(options.signal.aborted
            ? "Desktop application database startup was cancelled."
            : messages[phase]);
    } finally {
        await connection.close();
    }
}
