import { join } from "node:path";
import {
    createInfrastructureCredentials,
    infrastructureStackName,
    preparePrivateInfrastructureDirectory,
    readInfrastructureCredentials,
    writeInfrastructureConfiguration,
} from "./infrastructure-configuration.js";
import { DesktopInfrastructureError } from "./infrastructure-error.js";
import { runInfrastructureProcess, startupDelay } from "./infrastructure-process.js";

export { DesktopInfrastructureError } from "./infrastructure-error.js";

export interface DesktopInfrastructureStep {
    id: string;
    label: string;
    status: "pending" | "running" | "complete" | "error";
    detail: string | null;
}

export interface DesktopInfrastructureOptions {
    runtimeDirectory: string;
    assetsDirectory: string;
    report: (step: DesktopInfrastructureStep) => void;
    signal: AbortSignal;
}

export interface DesktopInfrastructure {
    stackName: string;
    litellmUrl: string;
    litellmMasterKey: string;
    milvusUrl: string;
    milvusToken: string;
}

type InfrastructureStepId = "docker" | "litellm-database" | "milvus" | "litellm";
const STEP_LABELS: Record<InfrastructureStepId, string> = {
    docker: "Docker Desktop",
    "litellm-database": "LiteLLM database",
    milvus: "Milvus vector database",
    litellm: "LiteLLM gateway",
};

const CLI_TIMEOUT_MS = 20_000;
const DOCKER_START_TIMEOUT_MS = 180_000;
const IMAGE_PULL_TIMEOUT_MS = 30 * 60_000;
const STACK_START_TIMEOUT_MS = 15 * 60_000;
const SERVICE_READY_TIMEOUT_MS = 10 * 60_000;
const HTTP_TIMEOUT_MS = 10_000;
const MAX_READINESS_RESPONSE_BYTES = 1024 * 1024;

async function ensureLocalDocker(signal: AbortSignal, report: (detail: string) => void): Promise<void> {
    const docker = (args: string[], failureMessage: string, timeoutMs = CLI_TIMEOUT_MS) => runInfrastructureProcess("docker", args, { signal, timeoutMs, failureMessage });
    const version = await docker(["compose", "version", "--short"], "Docker Compose is unavailable. Install the current Docker Desktop release and enable Linux containers.");
    const major = /^v?(\d+)\./.exec(version)?.[1];
    if (!major || Number(major) < 2) throw new DesktopInfrastructureError("Docker Compose v2 or newer is required. Update Docker Desktop before starting the application.");
    let dockerHost: string;
    if (process.env.DOCKER_HOST !== undefined) dockerHost = process.env.DOCKER_HOST;
    else {
        const value = await docker(["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"], "The local Docker context could not be read. Select your Docker Desktop context and retry.");
        try { dockerHost = JSON.parse(value) as string; }
        catch { throw new DesktopInfrastructureError("The local Docker context is invalid. Select your Docker Desktop context and retry."); }
    }
    if (typeof dockerHost !== "string" || (!dockerHost.startsWith("npipe://") && !dockerHost.startsWith("unix://"))) {
        throw new DesktopInfrastructureError("Desktop infrastructure requires a local Docker Desktop context. Remote Docker endpoints are not supported.");
    }
    const engine = () => docker(["info", "--format", "{{.OSType}}"], "Docker Desktop is not ready. Start Docker Desktop with Linux containers and retry.");
    let operatingSystem: string;
    try { operatingSystem = await engine(); }
    catch {
        if (signal.aborted) throw new DesktopInfrastructureError("Desktop infrastructure startup was cancelled.");
        report("Starting Docker Desktop and waiting for its Linux container engine...");
        await docker(["desktop", "start", "--detach"], "Docker Desktop could not be started automatically. Open Docker Desktop, wait for its engine, and retry.", DOCKER_START_TIMEOUT_MS);
        const deadline = Date.now() + DOCKER_START_TIMEOUT_MS;
        for (;;) {
            try { operatingSystem = await engine(); break; }
            catch {
                if (signal.aborted) throw new DesktopInfrastructureError("Desktop infrastructure startup was cancelled.");
                if (Date.now() >= deadline) throw new DesktopInfrastructureError("Docker Desktop did not become ready. Open Docker Desktop and confirm its Linux engine is running.");
                await startupDelay(2_000, signal);
            }
        }
    }
    if (operatingSystem !== "linux") throw new DesktopInfrastructureError("Switch Docker Desktop to Linux containers before starting the application.");
}

async function infrastructureJson(url: string, options: { signal: AbortSignal; authorization?: string; body?: Record<string, unknown> }): Promise<unknown> {
    const headers = new Headers({ Accept: "application/json" });
    if (options.authorization !== undefined) headers.set("Authorization", `Bearer ${options.authorization}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(url, {
        method: options.body === undefined ? "GET" : "POST",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: "error",
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(HTTP_TIMEOUT_MS)]),
    });
    if (!response.ok) {
        await response.body?.cancel();
        throw new DesktopInfrastructureError("The local service rejected its startup readiness or authentication check. Check the managed Docker project and restore its saved credentials if necessary.");
    }
    if (response.body === null) throw new DesktopInfrastructureError("A local service returned an empty startup readiness response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            length += chunk.value.byteLength;
            if (length > MAX_READINESS_RESPONSE_BYTES) {
                await reader.cancel();
                throw new DesktopInfrastructureError("A local service exceeded the allowed startup readiness response size.");
            }
            chunks.push(chunk.value);
        }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function responseObject(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Starts only this user's managed project. Containers and named data volumes intentionally survive app exit. */
export async function ensureDesktopInfrastructure(options: DesktopInfrastructureOptions): Promise<DesktopInfrastructure> {
    let phase: InfrastructureStepId = "docker";
    const report = (id: InfrastructureStepId, status: DesktopInfrastructureStep["status"], detail: string | null) => {
        options.report({ id, label: STEP_LABELS[id], status, detail });
    };
    try {
        report("docker", "running", "Preparing private infrastructure configuration and checking Docker Desktop...");
        const directory = await preparePrivateInfrastructureDirectory(options.runtimeDirectory, options.signal);
        const stackName = infrastructureStackName(options.runtimeDirectory);
        await ensureLocalDocker(options.signal, detail => report("docker", "running", detail));
        report("docker", "complete", "The local Linux container engine is ready.");

        phase = "litellm-database";
        report(phase, "running", "Loading persisted private service credentials...");
        let credentials = await readInfrastructureCredentials(directory);
        if (credentials === null) {
            const existingVolumes = await runInfrastructureProcess("docker", ["volume", "ls", "--filter", `label=com.docker.compose.project=${stackName}`, "--format", "{{.Name}}"], {
                signal: options.signal, timeoutMs: CLI_TIMEOUT_MS,
                failureMessage: "Existing managed data volumes could not be checked safely. Confirm Docker Desktop is available and retry.",
            });
            if (existingVolumes) throw new DesktopInfrastructureError("Managed infrastructure data exists but its private credentials are missing. Restore the infrastructure directory from backup to preserve encrypted provider keys and vector data.");
            credentials = await createInfrastructureCredentials(directory);
        }
        const env = await writeInfrastructureConfiguration(directory, options.assetsDirectory, credentials);
        const composePrefix = ["compose", "--project-name", stackName, "--project-directory", directory, "--file", join(directory, "compose.yaml"), "--env-file", join(directory, ".env")];
        const compose = (args: string[], failureMessage: string, timeoutMs = CLI_TIMEOUT_MS, onActivity?: () => void) => runInfrastructureProcess("docker", [...composePrefix, ...args], {
            signal: options.signal, cwd: directory, env, timeoutMs, failureMessage, onActivity,
        });
        for (const id of ["litellm-database", "milvus", "litellm"] as const) report(id, "running", "Downloading required container images. The first start can take several minutes...");
        let lastProgress = 0;
        await compose(["pull"], "Required container images could not be downloaded. Check registry access, Docker Desktop disk space, and your network, then retry. An older cached LiteLLM image will not be used.", IMAGE_PULL_TIMEOUT_MS, () => {
            if (Date.now() - lastProgress < 5_000) return;
            lastProgress = Date.now();
            report("litellm-database", "running", "Downloading required images from their registries. Startup continues when all downloads finish...");
        });
        // The explicit pull must succeed. Avoid a second pull while creating containers from exactly those images.
        await compose(["up", "--detach", "--no-build", "--pull", "never"], "The managed infrastructure containers could not start. Check Docker Desktop memory, disk space, and this application's Docker project, then retry.", STACK_START_TIMEOUT_MS);
        const readinessDeadline = Date.now() + SERVICE_READY_TIMEOUT_MS;

        const serviceId = async (service: string): Promise<string> => {
            const ids = (await compose(["ps", "--all", "--quiet", service], "A managed service container could not be located. Retry startup from Docker Desktop.")).split(/\r?\n/).filter(Boolean);
            if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) throw new DesktopInfrastructureError("A managed service container could not be identified safely. Check this application's Docker project and retry.");
            return ids[0];
        };
        const inspect = (id: string, format: string) => runInfrastructureProcess("docker", ["inspect", "--format", format, id], {
            signal: options.signal, env, timeoutMs: CLI_TIMEOUT_MS,
            failureMessage: "Managed service health could not be inspected. Confirm Docker Desktop is running and retry.",
        });
        const ready = async (service: string): Promise<string> => {
            const id = await serviceId(service);
            for (;;) {
                const state = await inspect(id, "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}");
                if (state === "running|healthy") return id;
                if (state.startsWith("exited|") || state.startsWith("dead|") || state.endsWith("|unhealthy")) {
                    throw new DesktopInfrastructureError("A required service failed its container health check. Check Docker Desktop resources and the managed project's service status, then retry.");
                }
                if (Date.now() >= readinessDeadline) throw new DesktopInfrastructureError("A required service did not become healthy within the startup window. Check Docker Desktop resources and retry.");
                await startupDelay(2_000, options.signal);
            }
        };
        const publishedUrl = async (id: string, targetPort: number): Promise<string> => {
            let bindings: unknown;
            try { bindings = JSON.parse(await inspect(id, "{{json .NetworkSettings.Ports}}")); }
            catch (error) { if (error instanceof DesktopInfrastructureError) throw error; throw new DesktopInfrastructureError("A managed service's private host port could not be read safely."); }
            const ports = responseObject(bindings);
            const entries = ports?.[`${targetPort}/tcp`];
            if (!Array.isArray(entries) || entries.length !== 1) throw new DesktopInfrastructureError("A managed service does not have exactly one private loopback port. Startup stopped to prevent an unsafe network connection.");
            const binding = responseObject(entries[0]);
            const port = Number(binding?.HostPort);
            if (binding?.HostIp !== "127.0.0.1" || !Number.isInteger(port) || port < 50_000 || port > 59_999) {
                throw new DesktopInfrastructureError("A managed service port is outside the private loopback allocation policy. Startup stopped to prevent an unsafe network connection.");
            }
            return `http://127.0.0.1:${port}`;
        };

        report("litellm-database", "running", "Waiting for the dedicated LiteLLM PostgreSQL database...");
        await ready("litellm-database");
        report("litellm-database", "complete", "The private LiteLLM database is healthy.");

        phase = "milvus";
        report(phase, "running", "Waiting for Milvus, its private metadata store, and its object storage...");
        const milvusId = await ready("milvus");
        const milvusUrl = await publishedUrl(milvusId, 19530);
        const milvusToken = `root:${credentials.milvusRootPassword}`;
        const milvus = responseObject(await infrastructureJson(`${milvusUrl}/v2/vectordb/collections/list`, { signal: options.signal, authorization: milvusToken, body: {} }));
        if (milvus?.code !== 0 || !Array.isArray(milvus.data)) throw new DesktopInfrastructureError("Milvus did not pass its authenticated startup check. Restore its saved credentials or inspect the managed Milvus service before retrying.");
        report(phase, "complete", "Milvus is healthy and authenticated access is verified.");

        phase = "litellm";
        report(phase, "running", "Waiting for LiteLLM database migrations and authenticated gateway readiness...");
        const litellmId = await ready("litellm");
        const litellmUrl = await publishedUrl(litellmId, 4000);
        const health = responseObject(await infrastructureJson(`${litellmUrl}/health/readiness`, { signal: options.signal }));
        if (health?.status !== "healthy" || health.db !== "connected") throw new DesktopInfrastructureError("LiteLLM is not ready with its PostgreSQL database. Check the managed gateway and database services, then retry.");
        const models = responseObject(await infrastructureJson(`${litellmUrl}/v1/models`, { signal: options.signal, authorization: credentials.litellmMasterKey }));
        if (!Array.isArray(models?.data)) throw new DesktopInfrastructureError("LiteLLM did not pass its authenticated startup check. Restore its saved private credentials before retrying.");
        report(phase, "complete", "LiteLLM is ready with its private database and verified master key.");
        return { stackName, litellmUrl, litellmMasterKey: credentials.litellmMasterKey, milvusUrl, milvusToken };
    } catch (error) {
        const safe = error instanceof DesktopInfrastructureError ? error : new DesktopInfrastructureError(options.signal.aborted
            ? "Desktop infrastructure startup was cancelled."
            : "Desktop infrastructure could not initialize safely. Check Docker Desktop and the application's private runtime directory, then retry.");
        report(phase, "error", safe.message);
        throw safe;
    }
}
