import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";

const root = fileURLToPath(new URL("../", import.meta.url));
const rust = (await import("node:child_process")).spawnSync("rustc", ["-vV"], { encoding: "utf8" });
const target = /^host: (.+)$/m.exec(rust.stdout)[1];
const node = path.join(root, `src-tauri/binaries/detqel-node-${target}${process.platform === "win32" ? ".exe" : ""}`);
const child = spawn(node, [path.join(root, "src-tauri/resources/backend/dist/desktop-entry.js")], {
  cwd: tmpdir(), env: { ...process.env, DETQEL_CONFIG_PATH: path.join(root, "backend/.env") },
  stdio: ["pipe", "pipe", "ignore"], windowsHide: true,
});
const token = randomUUID();
const exit = new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
const timer = setTimeout(() => child.kill(), 65000);
const lines = createInterface({ input: child.stdout });
try {
  child.stdin.write(JSON.stringify({ token }) + "\n");
  const message = await new Promise((resolve, reject) => {
    lines.once("line", line => resolve(JSON.parse(line)));
    child.once("exit", () => reject(new Error("Packaged backend exited before readiness")));
  });
  assert.equal(message.ready, true, message.error);
  assert.match(message.address, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal((await fetch(message.address + "/health/live")).status, 401);
  const headers = { "x-detqel-desktop-token": token };
  assert.equal((await fetch(message.address + "/health", { headers })).status, 200);
  assert.equal((await fetch(message.address + "/api/domains", { headers })).status, 200);
  child.stdin.end();
  assert.equal(await exit, 0);
  console.log("Packaged runtime verified: migrations, database readiness, token protection, feature API, parent-pipe shutdown, and imports from another working directory.");
} finally {
  clearTimeout(timer);
  child.kill();
  lines.close();
}
