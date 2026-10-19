# Desktop setup validation

Validated on Windows x64 using Node.js 24.21.0, npm 11.19.0, Rust 1.95.0, Next.js 16.3.8, and Tauri 2.12.4.

- Both frontend and backend TypeScript checks pass; Rust formatting passes.
- The inherited API/architecture/logging regression tests plus desktop token coverage pass: 13 tests. Desktop failure and parent-disconnect tests pass: 2 tests.
- The native bridge path-restriction unit test passes.
- The production Next.js static export and compiled Fastify backend build successfully.
- Schema generation succeeds for all 30 current tables using the workspace-aware CLI and matching ORM/toolkit. Generated verification SQL is under the ignored `backend/.local/schema-check`, not the committed migration directory. PostgreSQL was not modified by this check.
- The packaged Node/backend runtime was launched from another working directory. Migration history and database readiness validated; unauthenticated transport requests returned 401; an authenticated feature API request succeeded; parent-pipe shutdown exited cleanly.
- The actual Windows release app rendered the existing login UI. The scoped native status/API commands succeeded against PostgreSQL, an external API path was denied, and closing the native window exited cleanly. The visual verification screenshot is ignored at `.local/native-smoke.png`.
- The Windows NSIS installer bundles both compiled applications, production Node dependencies, migrations, and the Node runtime. No developer `.env` files are staged by the packaging allowlist.

## Dependency and release scope

The production dependency audit returned zero reported vulnerabilities after updating Swagger UI and Drizzle ORM in this desktop workspace. Drizzle Kit was updated and its ORM tooling peer was explicitly installed to preserve generation support under npm workspaces.

The full development dependency audit also reports advisories in the Drizzle Kit/esbuild and ESLint glob-matching dependency chains. These tools are excluded from the installer; the production-only dependency audit is the runtime release check. Review upstream fixes before exposing development tooling to untrusted input or networks. No forced audit upgrades or unreviewed transitive overrides were applied.

The installer is unsigned because no organization signing certificate was provided. Configure Windows code signing for public distribution. PostgreSQL remains an external prerequisite; the app never creates or migrates databases during startup. The backend's existing authentication/tenant-authorization limitations are documented in its README and are unchanged by desktop packaging.

The optional disposable-database integration suite and live external AI-provider requests were not run as part of setup. Existing configured PostgreSQL was exercised read-only by the runtime/native smoke tests. No claims are made about untested external credentials or future provider availability.
