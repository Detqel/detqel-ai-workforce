export const DATABASE_ADMIN_OPTIONS = {
    maximumConnections: 1,
    connectTimeoutSeconds: 10,
    closeTimeoutSeconds: 5,
    maintenanceDatabase: "postgres",
    maximumNameBytes: 63,
} as const;

export const DATABASE_ERROR_CODES = {
    duplicateDatabase: "42P04",
    uniqueViolation: "23505",
    foreignKeyViolation: "23503",
} as const;

export const DATABASE_MIGRATIONS = {
    relativeDirectory: "../../../../drizzle/",
    metadataDirectory: "meta",
    journalFile: "_journal.json",
    lockTimeout: "30s",
    lockNamespace: 1732401,
    lockId: 1,
} as const;

export const DATABASE_COMMANDS = {
    initialize: "init",
    migrate: "migrate",
    seed: "seed",
    seedDemo: "seed-demo",
    setup: "setup",
} as const;
