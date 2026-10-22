# DETQEL Kin Desktop

An independent Tauri 2 desktop workspace containing the full Next.js frontend and Fastify/PostgreSQL backend. Continue feature development in this folder. The sibling web/API projects are the original applications; changes are not automatically synchronized between them. Their current source, assets, migrations, and tests were copied during setup, including uncommitted frontend edits.

## Prerequisites

- Windows 10/11 x64, Microsoft Edge WebView2, Rust stable MSVC, and Visual Studio C++ desktop build tools with the Windows SDK.
- Node.js **24 LTS** and npm 11. The build packages the installed Node executable and records its version and SHA-256; use a trusted Node distribution on build machines.
- Current Docker Desktop with a local Linux container engine and Docker Compose v2. The desktop app starts its managed services automatically; the first launch downloads their images.
- Docker provides separate managed PostgreSQL containers for the application and LiteLLM. AI-provider features and the existing Unsplash CAPTCHA images require internet access.

## First setup and development

Run from `detqel-workforce-desktop`:

```powershell
npm ci
Copy-Item backend/.env.example backend/.env # Only if backend/.env does not exist
npm run dev
```

During this initial migration, the original local backend `.env` was copied into the ignored `backend/.env` for local development only. It is never included in installers. Run `db:setup` only for a database you intend to provision/migrate; back up existing data before schema upgrades.

`npm run dev` builds and opens the native embedded loader first. After the loader paints, Rust starts Next.js hot reload and the backend using the local TypeScript loader. The loader tracks both processes, Docker service creation, migrations, and API readiness. Frontend changes reload immediately; changes under `backend/src` trigger Tauri's restart and reload the backend from source. Rust changes rebuild the native application. Restart after editing `.env`. The native runtime owns and stops the Next.js process; do not start `dev:frontend` separately during desktop development. The configured frontend development port must be free.

```text
frontend/src/          UI, contexts, navigation, API client
backend/src/           Complete feature modules, repositories, API, database tooling
backend/drizzle/       Committed migrations and migration history
src-tauri/src/         Rust process supervisor and restricted API bridge
src-tauri/permissions/ Explicit permissions for desktop lifecycle and API commands
scripts/prepare.mjs    Builds/stages redistributable runtime resources
tests/                 Desktop lifecycle regression tests
```

Add API features in `backend/src/modules`, preserving the repository/service/controller structure described in `backend/README.md`. Add UI features in `frontend/src`. API calls must use `desktopFetch` through `frontend/src/lib/api.ts`; direct browser HTTP calls bypass the native bridge and are blocked by the packaged CSP. The entire existing API is compiled, including features without current UI consumers. Next.js uses static export: server actions, SSR, and dynamic route handlers need to live in the Fastify backend instead. Next Image runs without the server image optimizer.

Maintain reusable names, hosts, ports, timeouts, limits, and configuration in each application's `src/constants` folder, grouped by functionality (`commonConstants.ts`, `networkConstants.ts`, `dockerConstants.ts`, and related modules). Import these values in consumers rather than declaring configuration inline. Environment overrides remain in the existing configuration layer; connector catalog records and schemas remain database-managed.

## Build an installer

```powershell
npm run check
npm test
npm run build
```

Build output:

```text
src-tauri/target/release/detqel-workforce-desktop.exe
src-tauri/target/release/bundle/nsis/DETQEL Kin_0.1.0_x64-setup.exe
```

Distribute the installer. The raw executable requires the adjacent packaged Node runtime and resource directory and is not a standalone distribution. The default target is a per-user Windows NSIS installer; no administrator installation is required. A first build may download Cargo crates, the NSIS toolchain, and Next.js Google fonts. The installer includes compiled frontend assets, compiled backend code, production-only Node dependencies, migration files, Node licensing notices, and the Node runtime. Users do not need Node, npm, or Rust installed. WebView2 bootstrap behavior follows Tauri's default Windows installer configuration.

`npm run build:debug` builds an installable debug variant; `npm run build:app` stages runtime assets without compiling the Rust app. Native installers must be built on a matching OS/architecture; the preparation script rejects cross-compilation rather than packaging an incompatible Node executable.

The official Node distribution's adjacent `LICENSE` file supplies redistribution notices. For a custom Node installation, set `NODE_LICENSE_PATH` to the complete matching Node license/third-party notices before building. Both npm and Cargo lockfiles are committed; release builds enforce Cargo's `--locked` mode. The root ORM development dependency provides the peer package required by the hoisted Drizzle toolkit.

## Installed application configuration and database maintenance

On first launch the app creates a writable configuration file, without overwriting it on later launches or upgrades:

```text
%APPDATA%\com.detqel.workforce\backend.env
```

Development uses `backend/.env` instead. Environment variables take precedence over file configuration. Provider URLs and database pool options remain supported. The desktop backend receives its managed application database URL during startup; an existing external `DATABASE_URL` is preserved in the configuration file. The app binds its backend to an available `127.0.0.1` port in 50000–59999, irrespective of configured `HOST`/`PORT`, and uses production mode for installed backend execution. Keep configuration files private; do not place database credentials or provider secrets in `NEXT_PUBLIC_*` variables.

## Managed LiteLLM and Milvus services

Every desktop launch recreates this installation's verified service containers in the Docker Compose project `detqel-kin-stack`, preserving persistent volumes and credentials. Containers use the full `detqel-kin-` prefix. The native executable opens a standalone loader independently of React and tracks frontend hydration, backend process launch, Docker, databases, Milvus, LiteLLM, migrations, and API readiness. The main application window stays hidden until all startup stages succeed. Software updates are not part of this flow.

The stack contains the latest LiteLLM image from its primary GHCR registry, its dedicated PostgreSQL 16 database, one Milvus container with embedded metadata/local storage, and the managed application PostgreSQL database. LiteLLM's database has no host port and shares a dedicated internal network only with LiteLLM. LiteLLM, Milvus, and the application database receive available host ports in 50000–59999 with explicit `127.0.0.1` bindings; auxiliary ports are not published. These localhost endpoints require generated credentials. Localhost binding does not prevent other local programs from opening a TCP connection; authentication protects service access.

Images are pulled before existing containers are replaced. Compose creates missing containers automatically; containers use `restart: unless-stopped`, and named data volumes survive desktop exit. The managed application database is migrated and seeded during startup. Existing external application databases remain untouched. A failed image download or readiness check stops startup with an actionable error instead of showing a ready workspace.

Generated credentials and configuration are stored under `%APPDATA%\\com.detqel.workforce\\runtime\\infrastructure` for installed Windows builds, with current-user permissions. Preserve this directory together with the Docker volumes, especially the LiteLLM salt key. Ports and keys are discovered by the startup manager and provided only to the backend through `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `MILVUS_ADDRESS`, and `MILVUS_TOKEN`. Secrets are never sent to the startup UI. Configure gateway models/provider credentials in the managed LiteLLM configuration or its authenticated Admin UI; no model or embedding service is invented automatically.

See [infrastructure configuration](backend/infrastructure/README.md) for images, private networking, lifecycle, and operational limitations. No Docker launches, builds, or tests were run while implementing this feature.

Desktop startup provisions and migrates its managed application database and seeds reference data. For a separately operated external database, the maintenance commands below remain available:

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

Development diagnostics are stored in the git-ignored `logs` folder: `logs/frontend/frontend.log` records frontend errors and readiness, `logs/backend/backend.log` records backend and Docker-operation diagnostics, and `logs/backend/runtime.log` records native supervision and backend stdout/stderr. Installed builds use the operating system's application log directory, shown in the startup error panel. Logs redact credentials, bound entries, and rotate files. Frontend errors are captured before React hydration; a backend failure does not mark the frontend as failed.

`npm test` runs the inherited API regression suite and desktop failure/lifecycle tests. `cargo test --manifest-path src-tauri/Cargo.toml` checks bridge path restrictions; run `npm run prepare:dev` first to stage the Node binary. `npm run check` checks both TypeScript projects and Rust formatting. PostgreSQL integration tests require the explicit disposable-database admin connection described in `backend/README.md`.

After building, `npm run smoke:backend` checks the packaged runtime against the database in `backend/.env`, without modifying data. On Windows, `npm run smoke:native` briefly launches the compiled app using a process-scoped WebView2 debugging port, verifies the actual UI and IPC bridge, closes the native window, and saves an ignored screenshot to `.local/native-smoke.png`. It creates the application's normal per-user configuration/profile on first launch. These optional smoke tests require a running, migrated PostgreSQL database and are separate from CI's database-independent tests.

See [VALIDATION.md](VALIDATION.md) for the setup checks and dependency audit scope.

The provided CI workflow builds and uploads an unsigned Windows installer. The application icons are generated from the existing workforce logo. Before public distribution, configure organization-owned Windows code signing and verify release branding. Do not store signing keys or database credentials in the repository or bundle.

References: [Tauri Next.js integration](https://v2.tauri.app/start/frontend/nextjs/), [embedded resources](https://v2.tauri.app/develop/resources/), [security capabilities](https://v2.tauri.app/security/capabilities/).
