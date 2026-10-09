# DETQEL API

Fastify 5, TypeScript, PostgreSQL, and Drizzle ORM. Requires Node.js 20.18 or newer.

The backend follows a modular repository architecture:

```text
HTTP routes → controllers → application services → repository interfaces
                                                       ↓
                                           Drizzle repositories → PostgreSQL
```

```text
src/
  bootstrap/services.ts           Application composition and Fastify dependency types
  config/env.ts                   Validated configuration
  modules/<feature>/
    routes/                       Route paths and OpenAPI metadata
    controllers/                  Input validation and HTTP responses
    services/                     Use cases and transaction orchestration
    validation/                   Zod request schemas
    repositories/
      <feature>.repository.ts     Explicit repository contract
      drizzle.<feature>.repository.ts  Persistence implementation
  infrastructure/database/
    connection.ts                 Connection factory and pool lifecycle
    unit-of-work.ts               Repository wiring and transaction sessions
    schema/                       Drizzle tables and relations
    migrations/                   Locked migration runner and startup validation
    seeds/                        Reference data and optional demo data
    provision.ts                  Explicit database creation
    cli.ts                        Database lifecycle commands
  shared/
    contracts/                    Pagination, repository, and unit-of-work contracts
    errors/                       Application errors
    types/                        Shared DTOs and relational result shapes
    validation/                   Common HTTP schemas
    security/                     Existing password compatibility helpers
drizzle/                          Versioned SQL, snapshots, and migration journal
tests/                            Architecture, API, and PostgreSQL regression tests
```

## Local setup

Run these commands from `detqel-api`:

```powershell
npm ci
Copy-Item .env.example .env  # First setup only; configure PostgreSQL credentials.
npm run db:setup
npm run dev
```

`db:setup` provisions the database, applies migrations, and inserts the standard industry domains. It does not create demo accounts or demo workspaces. The PostgreSQL server must already be running. `DATABASE_ADMIN_URL`, when set, provides the maintenance connection for provisioning; otherwise provisioning connects to the `postgres` database using `DATABASE_URL` credentials. Provisioning needs `CREATEDB` privileges. Skip `db:init` when a managed service has already provisioned the target database.

The defaults expose the API on `http://127.0.0.1:8100`, Swagger UI on `/docs`, database readiness on `/health`, and process liveness on `/health/live`. Readiness returns HTTP 503 if the database is unavailable. Configuration is loaded from the project `.env` even when the compiled app is launched from another directory; process environment variables take precedence.

Optional local demo data:

```powershell
npm run db:seed:demo
```

Demo seeding is transactional, serialized, and recorded as `demo-v1` in `seed_history`. Repeating the command does not add duplicate demo missions, agents, or goals. Activity examples are restricted to the demo workspace. Existing records are looked up by the intended admin email and workspace slug. An existing demo workspace with a business profile is adopted into seed history without adding more sample records. A workspace with that slug owned by another user is rejected. Demo seeding is disabled when `NODE_ENV=production`.

## Database commands

| Command | Purpose |
| --- | --- |
| `npm run db:init` | Create the target database if missing; no tables or seed data. |
| `npm run db:generate -- --name change_name` | Generate SQL and snapshots after changing Drizzle schemas. Review and commit the generated files. |
| `npm run db:migrate` | Apply pending migrations; no database creation or seeding. |
| `npm run db:seed` | Insert standard industry domains; safe to repeat. |
| `npm run db:seed:demo` | Insert optional local demo data once. |
| `npm run db:setup` | Local provisioning, migrations, and reference seeding. |
| `npm run db:studio` | Inspect the database using Drizzle Studio. |

The CLI uses the installed TypeScript loader so Drizzle 0.30 can resolve `.js` ESM specifiers to TypeScript source. `db:push` was removed from the scripts because untracked schema changes bypass migration history.

Migrations use a dedicated one-connection client and a PostgreSQL advisory lock, with a 30-second lock wait limit. The runner verifies checksums and journal timestamps against the applied history, fails if migration artifacts are absent, and always releases the connection. Drizzle applies pending DDL and journal entries in a transaction. Never edit an applied SQL file or reuse its journal timestamp; add a new migration instead.

Migration `0003_enterprise_database_lifecycle` adds the missing notifications and industry-domain schema, seed history, and uniqueness constraints for workspace owner/name/industry, membership, business profile, and normalized domain names. It adopts notifications and industry-domain tables created outside the old migration journal and preserves their data. Workspaces with the same name owned by different users remain separate. The first three migration files are unchanged.

Before upgrading an existing database, back it up and inspect conflicting records. The migration consolidates membership and business-profile rows only when all business fields match; IDs and creation/update/join timestamps are excluded from that comparison. The oldest row is retained, and complete copies of removed rows and their retained IDs are stored in `drizzle.__reconciled_rows`. This happens in the same transaction as the schema upgrade, under table locks. Consolidation fails if another table references those rows. Rows with differing business content require explicit reconciliation; a failed upgrade rolls back both consolidation and schema changes.

These read-only queries identify conflicts:

```sql
SELECT created_by, lower(trim(name)), lower(trim(coalesce(industry, ''))), count(*)
FROM workspaces GROUP BY 1, 2, 3 HAVING count(*) > 1;
SELECT workspace_id, user_id, count(*)
FROM workspace_members GROUP BY 1, 2 HAVING count(*) > 1;
SELECT workspace_id, count(*)
FROM business_profile GROUP BY 1 HAVING count(*) > 1;
-- Run only if the legacy industry_domains table already exists:
SELECT lower(trim(name)), count(*)
FROM industry_domains GROUP BY 1 HAVING count(*) > 1;
```

Databases previously changed with `drizzle-kit push` or manual DDL need their actual schema and migration history reconciled before adopting this workflow. The runner does not silently mark untracked migrations as applied.

`node scripts/backup-database.mjs` writes a consistent snapshot of public-table rows and migration history to the ignored `.local/database-backups/` folder. These files contain database data and should stay private. Use PostgreSQL `pg_dump` for a full schema-and-data backup for production deployment.

## Deployment

Build the application, then run migrations and reference seeding as a deployment step using credentials with schema privileges. Start application instances with runtime credentials afterward:

```powershell
npm run build
node dist/infrastructure/database/cli.js migrate
node dist/infrastructure/database/cli.js seed
npm start
```

Ship `dist/`, `drizzle/`, `package.json`, the lockfile, and production dependencies. The SQL directory must retain its location beside `dist`; migration resolution uses the module location, independent of the working directory. The compiled server validates migration history before listening. API startup performs no provisioning, migrations, DDL, or seeding. SIGINT/SIGTERM close Fastify and its connection pool.

## Adding or testing a feature

Define repository operations explicitly in the feature contract. Implement them in its Drizzle repository with an injected `DatabaseSession`; never construct a global client. Register the repository in `UnitOfWork`, implement the use case in a service, and wire that service in `bootstrap/services.ts`. Controllers validate requests and translate service results into the existing API response shapes. Application layers have no runtime ORM dependency; shared entity DTOs use type-only schema exports to keep persistence shapes synchronized without importing table objects at runtime.

For a multi-record write, call `IUnitOfWork.transaction` and use only the repositories supplied to its callback. All repositories are recreated against the transaction session. Workspace/profile/owner writes and mission/approval/execution event writes already follow this rule.

```powershell
npm run typecheck
npm test
npm run build
node tests/compiled-smoke.mjs

# An explicit admin connection is required for integration tests.
$env:TEST_DATABASE_ADMIN_URL = 'postgres://postgres:postgres@localhost:5432/postgres'
npm run test:integration
```

Integration tests create uniquely named temporary databases, exercise fresh/legacy migrations, seed repeatability, API response contracts, and transaction rollback, then remove those databases. Without `TEST_DATABASE_ADMIN_URL`, the integration suite is skipped. The architecture tests enforce that HTTP and application layers never import database implementations. The compiled smoke test checks production ESM imports, migration paths, documentation, and pool shutdown from another working directory.

This refactor preserves the current authentication behavior and public endpoints. Session/token authentication, authorization and tenant isolation, and replacing legacy SHA-256/plaintext password compatibility remain separate product work; they are not implemented by the repository restructuring.
