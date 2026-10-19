import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// Uses a deliberately unreachable database: verifies bounded, secret-free failure
// and process cleanup without creating or modifying any developer database.
test("desktop backend fails cleanly with an unavailable database", { timeout: 65000 }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "detqel-desktop-"));
  const config = path.join(temporary, "backend.env");
  const secret = "never-print-this-password";
  await writeFile(config, `DATABASE_URL=postgres://test:${secret}@127.0.0.1:1/missing\nDB_CONNECT_TIMEOUT=1\n`);
  const env = { ...process.env, DETQEL_CONFIG_PATH: config };
  delete env.DATABASE_URL;
  delete env.NODE_OPTIONS;
  const child = spawn(process.execPath, ["--import", "tsx", "backend/src/desktop-entry.ts"], {
    cwd: root, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
  });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk; });
  const exit = new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  const lines = createInterface({ input: child.stdout });
  const output = [];
  lines.on("line", line => output.push(line));
  child.stdin.write(JSON.stringify({ token: randomUUID() }) + "\n");
  const timer = setTimeout(() => child.kill(), 55000);
  try {
    assert.equal(await exit, 1);
    assert.equal(output.length, 1);
    assert.equal(JSON.parse(output[0]).ready, false);
    assert.ok(![...output, stderr].join("\n").includes(secret));
  } finally {
    clearTimeout(timer);
    child.kill();
    await rm(temporary, { recursive: true, force: true });
  }
});

test("desktop backend exits when the parent closes during initialization", { timeout: 20000 }, async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "backend/src/desktop-entry.ts"], {
    cwd: root, stdio: ["pipe", "ignore", "ignore"], windowsHide: true,
  });
  const exit = new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  child.stdin.end();
  const timer = setTimeout(() => child.kill(), 15000);
  try { assert.equal(await exit, 1); }
  finally { clearTimeout(timer); child.kill(); }
});
