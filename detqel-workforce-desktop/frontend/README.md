# DETQEL Desktop Frontend

This is the complete Next.js UI in the independent desktop workspace. Develop UI features under `src`; start and package the application from the workspace root using `npm run dev` and `npm run build`.

Tauri embeds the static `out/` export. Next Image uses unoptimized assets. Keep server-side features in the sibling Fastify backend; server actions and SSR are not available in the embedded static frontend.

The shared API client uses `desktopFetch` to send application requests through the scoped native bridge. Browser-only development falls back to `NEXT_PUBLIC_API_URL` or the existing loopback default. `DesktopGate` displays startup failures before mounting workspace consumers.

See [the workspace README](../README.md) for development, packaging, configuration, testing, and database maintenance.
