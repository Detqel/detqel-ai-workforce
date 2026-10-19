# DETQEL Workforce Desktop

An independent Tauri 2 desktop workspace containing the full Next.js frontend and Fastify/PostgreSQL backend. Continue feature development in this folder. The sibling web/API projects are the original applications; changes are not automatically synchronized between them. Their current source, assets, migrations, and tests were copied during setup, including uncommitted frontend edits.

## Prerequisites

- Windows 10/11 x64, Microsoft Edge WebView2, Rust stable MSVC, and Visual Studio C++ desktop build tools with the Windows SDK.
- Node.js **24 LTS** and npm 11. The build packages the installed Node executable and records its version and SHA-256; use a trusted Node distribution on build machines.
- An accessible PostgreSQL service. PostgreSQL is an external service, not bundled or installed by the desktop application. AI-provider features and the existing Unsplash CAPTCHA images require internet access.

## First setup and development

Run from `detqel-workforce-desktop`:

```powershell
npm ci
Copy-Item backend/.env.example backend/.env # Only if backend/.env does not exist
# Edit backend/.env to use your PostgreSQL connection.
npm run db:setup
npm run dev
```

During this initial migration, the original local backend `.env` was copied into the ignored `backend/.env` for local development only. It is never included in installers. Run `db:setup` only for a database you intend to provision/migrate; back up existing data before schema upgrades.

`npm run dev` starts Next.js hot reload and the native desktop window. Rust launches the backend using the local TypeScript loader. Frontend changes reload immediately; changes under `backend/src` trigger Tauri's restart and reload the backend from source. Rust changes rebuild the native application. Restart after editing `.env`. Only one development session should use frontend port 3100 at a time, including the original web project.

```text
frontend/src/          UI, contexts, navigation, API client
backend/src/           Complete feature modules, repositories, API, database tooling
backend/drizzle/       Committed migrations and migration history
src-tauri/src/         Rust process supervisor and restricted API bridge
src-tauri/permissions/ Explicit permissions for the two desktop commands
scripts/prepare.mjs    Builds/stages redistributable runtime resources
tests/                 Desktop lifecycle regression tests
```

Add API features in `backend/src/modules`, preserving the repository/service/controller structure described in `backend/README.md`. Add UI features in `frontend/src`. API calls must use `desktopFetch` through `frontend/src/lib/api.ts`; direct browser HTTP calls bypass the native bridge and are blocked by the packaged CSP. The entire existing API is compiled, including features without current UI consumers. Next.js uses static export: server actions, SSR, and dynamic route handlers need to live in the Fastify backend instead. Next Image runs without the server image optimizer.

## Build an installer

```powershell
npm run check
npm test
npm run build
```

Build output:

```text
src-tauri/target/release/detqel-workforce-desktop.exe
src-tauri/target/release/bundle/nsis/DETQEL Workforce_0.1.0_x64-setup.exe
```

Distribute the installer. The raw executable requires the adjacent packaged Node runtime and resource directory and is not a standalone distribution. The default target is a per-user Windows NSIS installer; no administrator installation is required. A first build may download Cargo crates, the NSIS toolchain, and Next.js Google fonts. The installer includes compiled frontend assets, compiled backend code, production-only Node dependencies, migration files, Node licensing notices, and the Node runtime. Users do not need Node, npm, or Rust installed. WebView2 bootstrap behavior follows Tauri's default Windows installer configuration.

`npm run build:debug` builds an installable debug variant; `npm run build:app` stages runtime assets without compiling the Rust app. Native installers must be built on a matching OS/architecture; the preparation script rejects cross-compilation rather than packaging an incompatible Node executable.

The official Node distribution's adjacent `LICENSE` file supplies redistribution notices. For a custom Node installation, set `NODE_LICENSE_PATH` to the complete matching Node license/third-party notices before building. Both npm and Cargo lockfiles are committed; release builds enforce Cargo's `--locked` mode. The root ORM development dependency provides the peer package required by the hoisted Drizzle toolkit.

## Installed application configuration and database maintenance

On first launch the app creates a writable configuration file, without overwriting it on later launches or upgrades:

```text
%APPDATA%\com.detqel.workforce\backend.env
```

Edit `DATABASE_URL` there, ensure PostgreSQL is accessible and migrations are current, then restart. Environment variables take precedence over file configuration. Development uses `backend/.env` instead. Provider URLs and database pool options remain supported. The app forces its backend to loopback on an OS-assigned port, irrespective of configured `HOST`/`PORT`, and uses production mode for installed backend execution. Keep configuration files private; do not place database credentials or provider secrets in `NEXT_PUBLIC_*` variables.

Runtime startup verifies database migration history and performs no provisioning, migrations, or seeding. For initial provisioning or an upgrade, an operator uses this source workspace against the **same database** configured for the installed app:

```powershell
$env:DATABASE_URL = 'postgres://USER:PASSWORD@HOST:5432/DATABASE'
npm run db:migrate
npm run db:seed
# First-time local provisioning only: npm run db:setup
Remove-Item Env:DATABASE_URL
```

Review migration SQL and back up the database before upgrades. Never edit applied migrations. See `backend/README.md` for admin credentials, seed policy, migration conflict handling, and optional integration tests. The desktop wrapper does not replace the application's existing authentication/authorization model; production rollout still requires the product security work identified in that backend README.

## Runtime boundaries and validation

The webview has no shell or filesystem plugin permissions. Two explicitly scoped native commands expose backend status and an API bridge. Rust allows only application API paths/methods, disables proxy discovery and redirects, and injects a per-launch token that is never exposed to the UI, argv, or a configuration file. The backend binds only to `127.0.0.1` on an available port and rejects requests without the token. CSP restricts external images to the current Unsplash source; provider requests run in the backend. Next.js requires inline bootstrap scripts, so the current CSP retains `unsafe-inline`. This bridge protects the local transport; it does not add tenant authorization to existing endpoints.

The supervisor waits for database validation and backend readiness before displaying the application, monitors backend exit, requests graceful pool shutdown on exit, and force-terminates only after a shutdown timeout. Closing the parent pipe also shuts down the backend if the native app crashes. Startup errors show the configuration path and remediation without printing credentials.

`npm test` runs the inherited API regression suite and desktop failure/lifecycle tests. `cargo test --manifest-path src-tauri/Cargo.toml` checks bridge path restrictions; run `npm run prepare:dev` first to stage the Node binary. `npm run check` checks both TypeScript projects and Rust formatting. PostgreSQL integration tests require the explicit disposable-database admin connection described in `backend/README.md`.

After building, `npm run smoke:backend` checks the packaged runtime against the database in `backend/.env`, without modifying data. On Windows, `npm run smoke:native` briefly launches the compiled app using a process-scoped WebView2 debugging port, verifies the actual UI and IPC bridge, closes the native window, and saves an ignored screenshot to `.local/native-smoke.png`. It creates the application's normal per-user configuration/profile on first launch. These optional smoke tests require a running, migrated PostgreSQL database and are separate from CI's database-independent tests.

See [VALIDATION.md](VALIDATION.md) for the setup checks and dependency audit scope.

The provided CI workflow builds and uploads an unsigned Windows installer. The application icons are generated from the existing workforce logo. Before public distribution, configure organization-owned Windows code signing and verify release branding. Do not store signing keys or database credentials in the repository or bundle.

References: [Tauri Next.js integration](https://v2.tauri.app/start/frontend/nextjs/), [embedded resources](https://v2.tauri.app/develop/resources/), [security capabilities](https://v2.tauri.app/security/capabilities/).
