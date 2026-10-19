import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

// Resolve through npm workspaces instead of assuming a nested node_modules tree.
const require = createRequire(import.meta.url);
await import(pathToFileURL(path.join(path.dirname(require.resolve("drizzle-kit")), "bin.cjs")).href);
