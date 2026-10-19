// The parent owns configuration and process lifetime; stdout is a readiness channel.
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";

const input = createInterface({ input: process.stdin });
let shutdown: (() => Promise<void>) | undefined;
let parentClosed = false;
input.on("close", () => {
    parentClosed = true;
    if (shutdown) void shutdown();
});

async function main() {
    const initialization = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Desktop initialization timed out")), 10_000);
        input.once("line", line => { clearTimeout(timer); resolve(line); });
        input.once("close", () => { clearTimeout(timer); reject(new Error("Desktop parent disconnected")); });
    });
    const { token } = JSON.parse(initialization) as { token: string };
    if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error("Invalid desktop initialization");
    const configPath = process.env.DETQEL_CONFIG_PATH;
    if (!configPath) throw new Error("Desktop configuration path is missing");
    const { parse } = await import("dotenv");
    const values = parse(await readFile(configPath));
    // Do not allow user configuration to change the private loopback transport.
    for (const [key, value] of Object.entries(values)) {
        if (!["HOST", "PORT", "NODE_ENV", "NODE_OPTIONS", "NODE_PATH"].includes(key) && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";
    process.env.NODE_ENV = "production";
    process.env.DETQEL_DESKTOP = "1";
    const { buildApp } = await import("./app.js");
    const app = await buildApp({ verifyDatabase: true, desktopToken: token });
    let stopping = false;
    shutdown = async () => {
        if (stopping) return;
        stopping = true;
        await app.close();
        input.close();
    };
    input.on("line", line => { if (line === "shutdown") void shutdown?.(); });
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void shutdown?.(); });
    if (parentClosed) { await shutdown(); return; }
    try {
        const health = await app.services.health.check();
        if (health.database !== "connected") throw new Error("PostgreSQL is unavailable");
        const address = await app.listen({ host: "127.0.0.1", port: 0 });
        process.stdout.write(`${JSON.stringify({ ready: true, address })}\n`);
    } catch (error) {
        await shutdown();
        throw error;
    }
}

main().catch(() => {
    // Provider/database exceptions can contain credentials. Keep startup errors generic.
    process.stdout.write(`${JSON.stringify({ ready: false, error: "Backend startup failed. Check backend.env, PostgreSQL availability, and run database migrations using the documented maintenance workflow." })}\n`);
    input.close();
    process.exitCode = 1;
});
