// The parent owns configuration and process lifetime; stdout carries startup events only.
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import {
    DesktopInfrastructureError,
    ensureDesktopInfrastructure,
} from "./desktop/infrastructure/desktop-infrastructure.js";
import { DESKTOP_STARTUP_STEPS, emitStartupStep, listenOnPrivatePort } from "./desktop/startup.js";

const input = createInterface({ input: process.stdin });
const startup = new AbortController();
let app: FastifyInstance | undefined;
let parentClosed = false;
let stopping = false;
let currentStep: string | undefined;

async function shutdown(): Promise<void> {
    if (stopping) return;
    stopping = true;
    startup.abort();
    try { await app?.close(); }
    finally { input.close(); }
}

input.on("close", () => {
    parentClosed = true;
    void shutdown();
});
input.on("line", line => {
    if (line === "shutdown") void shutdown();
});
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void shutdown(); });

function report(id: string, status: "running" | "complete" | "error", detail: string | null): void {
    const step = DESKTOP_STARTUP_STEPS.find(item => item.id === id);
    if (!step) throw new Error("Unknown desktop startup step");
    if (status === "running") currentStep = id;
    emitStartupStep({ ...step, status, detail });
}

async function main(): Promise<void> {
    const initialization = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Desktop initialization timed out")), 10_000);
        input.once("line", line => { clearTimeout(timer); resolve(line); });
        input.once("close", () => { clearTimeout(timer); reject(new Error("Desktop parent disconnected")); });
    });
    const { token } = JSON.parse(initialization) as { token: string };
    if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error("Invalid desktop initialization");

    for (const step of DESKTOP_STARTUP_STEPS) emitStartupStep({ ...step, status: "pending", detail: null });
    const configPath = process.env.DETQEL_CONFIG_PATH;
    const runtimeDirectory = process.env.DETQEL_RUNTIME_DIR;
    if (!configPath || !runtimeDirectory) throw new Error("Desktop configuration paths are missing");
    const { parse } = await import("dotenv");
    const values = parse(await readFile(configPath));
    for (const [key, value] of Object.entries(values)) {
        if (!["HOST", "PORT", "NODE_ENV", "NODE_OPTIONS", "NODE_PATH", "DETQEL_RUNTIME_DIR"].includes(key) && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "0";
    process.env.NODE_ENV = "production";
    process.env.DETQEL_DESKTOP = "1";

    const infrastructure = await ensureDesktopInfrastructure({
        runtimeDirectory,
        assetsDirectory: fileURLToPath(new URL("../infrastructure/", import.meta.url)),
        report: step => {
            if (step.status === "running") currentStep = step.id;
            emitStartupStep(step);
        },
        signal: startup.signal,
    });
    if (startup.signal.aborted) return;
    // These credentials remain in the backend process; status/IPC never returns them.
    process.env.LITELLM_BASE_URL = infrastructure.litellmUrl;
    process.env.LITELLM_API_KEY = infrastructure.litellmMasterKey;
    process.env.MILVUS_ADDRESS = infrastructure.milvusUrl;
    process.env.MILVUS_TOKEN = infrastructure.milvusToken;

    report("application-database", "running", "Checking the configured application database");
    const { buildApp } = await import("./app.js");
    app = await buildApp({ verifyDatabase: true, desktopToken: token });
    const health = await app.services.health.check();
    if (health.database !== "connected") throw new Error("Application PostgreSQL is unavailable");
    report("application-database", "complete", "Database connection and migrations are ready");
    if (parentClosed || startup.signal.aborted) { await app.close(); return; }

    report("backend-api", "running", "Starting the private workspace API");
    const address = await listenOnPrivatePort(app);
    if (parentClosed || startup.signal.aborted) { await app.close(); return; }
    report("backend-api", "complete", "Workspace is ready");
    process.stdout.write(JSON.stringify({ ready: true, address }) + "\n");
}

main().catch(async error => {
    if (!stopping && !parentClosed) {
        const message = error instanceof DesktopInfrastructureError
            ? error.message
            : currentStep === "application-database"
                ? "Application database startup failed. Check backend.env, PostgreSQL availability, and apply pending application migrations."
                : "Desktop startup failed. Check your runtime configuration and restart DETQEL Workforce.";
        if (currentStep && DESKTOP_STARTUP_STEPS.some(step => step.id === currentStep)) {
            report(currentStep, "error", message);
        }
        process.stdout.write(JSON.stringify({ ready: false, error: message }) + "\n");
        process.exitCode = 1;
    }
    await shutdown();
});

