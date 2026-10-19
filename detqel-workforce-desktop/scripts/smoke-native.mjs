// Optional Windows release smoke test. Opens the app briefly using Microsoft's
// documented WebView2 debugging flag, and shuts it down through its native window.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

if (process.platform !== "win32") throw new Error("The native smoke test currently supports Windows WebView2");
const root = fileURLToPath(new URL("../", import.meta.url));
const { parse } = createRequire(path.join(root, "backend/package.json"))("dotenv");
const server = createServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const executable = path.join(root, "src-tauri/target/release/detqel-workforce-desktop.exe");
const child = spawn(executable, [], {
  cwd: path.dirname(executable), windowsHide: true, stdio: "ignore",
  env: {
    ...process.env, ...parse(await readFile(path.join(root, "backend/.env"))),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
  },
});
const exit = new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
let socket;
let sequence = 0;
const pending = new Map();
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function send(method, params = {}) {
  const id = ++sequence;
  const response = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
  });
  socket.send(JSON.stringify({ id, method, params }));
  return response;
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
try {
  let target;
  const deadline = Date.now() + 60000;
  while (!target && Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      target = (await response.json()).find(page => page.type === "page" && page.url.includes("tauri.localhost"));
    } catch { /* WebView2 is still starting. */ }
    if (!target) await sleep(500);
  }
  assert.ok(target, "Native WebView2 target did not become available");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let status;
  while (Date.now() < deadline) {
    status = await evaluate("window.__TAURI_INTERNALS__.invoke('backend_status')");
    if (status.ready || status.error) break;
    await sleep(500);
  }
  assert.equal(status?.ready, true, status?.error);
  const response = await evaluate("window.__TAURI_INTERNALS__.invoke('api_request', {path: '/api/domains', method: 'GET', body: null})");
  assert.equal(response.status, 200);
  const denied = await evaluate("window.__TAURI_INTERNALS__.invoke('api_request', {path: 'https://example.com/', method: 'GET', body: null}).then(() => false, () => true)");
  assert.equal(denied, true);
  // Wait until React has replaced the startup screen with the existing login UI.
  let inputs = 0;
  for (let attempts = 0; attempts < 20 && !inputs; attempts++) {
    inputs = await evaluate("document.querySelectorAll('input').length");
    if (!inputs) await sleep(500);
  }
  assert.ok(inputs > 0, "The existing login UI did not render");
  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  await mkdir(path.join(root, ".local"), { recursive: true });
  await writeFile(path.join(root, ".local/native-smoke.png"), Buffer.from(screenshot.data, "base64"));
  // WM_CLOSE follows the real Tauri exit lifecycle; do not force-kill on success.
  const closer = spawn("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${child.pid}).CloseMainWindow() | Out-Null`], { windowsHide: true, stdio: "ignore" });
  await new Promise(resolve => closer.once("exit", resolve));
  const code = await Promise.race([exit, sleep(12000).then(() => "timeout")]);
  assert.equal(code, 0, "The native app did not exit cleanly");
  console.log("Native release verified: embedded UI, scoped Tauri commands, database API, denied external paths, and graceful application exit.");
} finally {
  socket?.close();
  child.kill();
}
