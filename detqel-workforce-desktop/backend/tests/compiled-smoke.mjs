import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Exercise the production ESM output and paths without the TypeScript loader.
process.chdir(tmpdir());
const { buildApp } = await import("../dist/app.js");
const { defaultMigrationsFolder } = await import("../dist/infrastructure/database/migrations/runner.js");
await access(path.join(defaultMigrationsFolder, "meta", "_journal.json"));
const app = await buildApp({ logger: false });
try {
  assert.equal((await app.inject("/health/live")).statusCode, 200);
  assert.equal((await app.inject("/docs/json")).statusCode, 200);
  console.log("Compiled ESM server, migration paths, and pool shutdown verified from another working directory.");
} finally {
  await app.close();
}
