import { join } from "node:path";
import {
    DESKTOP_INFRASTRUCTURE_LABELS,
    DESKTOP_STARTUP_STATUS,
    DESKTOP_STARTUP_STEP_IDS,
    type DesktopInfrastructureStepId,
    type DesktopStartupStatus,
} from "../../constants/desktopConstants.js";
import {
    DOCKER_ASSET_FILES,
    DOCKER_CONTAINER_STATUS,
    DOCKER_CREDENTIAL_SETTINGS,
    DOCKER_ENVIRONMENT_KEYS,
    DOCKER_EXECUTABLE,
    DOCKER_HEALTH_ENDPOINTS,
    DOCKER_HEALTH_VALUES,
    DOCKER_INSPECT_FORMATS,
    DOCKER_IMAGE_PULLS,
    DOCKER_LABELS,
    DOCKER_LIMITS,
    DOCKER_LOCAL_ENDPOINT_PROTOCOLS,
    DOCKER_MINIMUM_COMPOSE_MAJOR_VERSION,
    DOCKER_PROTOCOLS,
    DOCKER_PREVIOUS_PROJECT_NAMES,
    DOCKER_RUNTIME_PLATFORM,
    DOCKER_SERVICE_NAMES,
    DOCKER_TIMEOUTS_MS,
    DOCKER_VALIDATION,
} from "../../constants/dockerConstants.js";
import { LOOPBACK_HOST, PRIVATE_PORT_RANGE, SERVICE_PORTS } from "../../constants/networkConstants.js";
import {
    createInfrastructureCredentials,
    infrastructureStackName,
    infrastructureRuntimeId,
    legacyInfrastructureStackName,
    preparePrivateInfrastructureDirectory,
    readInfrastructureCredentials,
    writeInfrastructureConfiguration,
} from "./infrastructure-configuration.js";
import {
    prepareInfrastructureDeployment,
    removeOwnedInfrastructureContainers,
} from "./infrastructure-deployment.js";
import { DesktopInfrastructureError } from "./infrastructure-error.js";
import { prepareInfrastructurePorts } from "./infrastructure-ports.js";
import { runInfrastructureProcess, startupDelay } from "./infrastructure-process.js";

export { DesktopInfrastructureError } from "./infrastructure-error.js";

export interface DesktopInfrastructureStep {
    id: string;
    label: string;
    status: DesktopStartupStatus;
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
    applicationDatabaseUrl: string;
}

async function ensureLocalDocker(signal: AbortSignal, report: (detail: string) => void): Promise<void> {
    const docker = (args: string[], failureMessage: string, timeoutMs: number = DOCKER_TIMEOUTS_MS.cli) => runInfrastructureProcess(DOCKER_EXECUTABLE, args, { signal, timeoutMs, failureMessage });
    const version = await docker(["compose", "version", "--short"], "Docker Compose is unavailable. Install the current Docker Desktop release and enable Linux containers.");
    const major = /^v?(\d+)\./.exec(version)?.[1];
    if (!major || Number(major) < DOCKER_MINIMUM_COMPOSE_MAJOR_VERSION) throw new DesktopInfrastructureError(`Docker Compose v${DOCKER_MINIMUM_COMPOSE_MAJOR_VERSION} or newer is required. Update Docker Desktop before starting the application.`);
    let dockerHost: string;
    const configuredHost = process.env[DOCKER_ENVIRONMENT_KEYS.host];
    if (configuredHost !== undefined) dockerHost = configuredHost;
    else {
        const value = await docker(["context", "inspect", "--format", DOCKER_INSPECT_FORMATS.contextHost], "The local Docker context could not be read. Select your Docker Desktop context and retry.");
        try { dockerHost = JSON.parse(value) as string; }
        catch { throw new DesktopInfrastructureError("The local Docker context is invalid. Select your Docker Desktop context and retry."); }
    }
    if (typeof dockerHost !== "string" || !DOCKER_LOCAL_ENDPOINT_PROTOCOLS.some(protocol => dockerHost.startsWith(protocol))) {
        throw new DesktopInfrastructureError("Desktop infrastructure requires a local Docker Desktop context. Remote Docker endpoints are not supported.");
    }
    const engine = () => docker(["info", "--format", DOCKER_INSPECT_FORMATS.operatingSystem], "Docker Desktop is not ready. Start Docker Desktop with Linux containers and retry.");
    let operatingSystem: string;
    try { operatingSystem = await engine(); }
    catch {
        if (signal.aborted) throw new DesktopInfrastructureError("Desktop infrastructure startup was cancelled.");
        report("Starting Docker Desktop and waiting for its Linux container engine...");
        await docker(["desktop", "start", "--detach"], "Docker Desktop could not be started automatically. Open Docker Desktop, wait for its engine, and retry.", DOCKER_TIMEOUTS_MS.desktopStart);
        const deadline = Date.now() + DOCKER_TIMEOUTS_MS.desktopStart;
        for (;;) {
            try { operatingSystem = await engine(); break; }
            catch {
                if (signal.aborted) throw new DesktopInfrastructureError("Desktop infrastructure startup was cancelled.");
                if (Date.now() >= deadline) throw new DesktopInfrastructureError("Docker Desktop did not become ready. Open Docker Desktop and confirm its Linux engine is running.");
                await startupDelay(DOCKER_TIMEOUTS_MS.pollInterval, signal);
            }
        }
    }
    if (operatingSystem !== DOCKER_RUNTIME_PLATFORM) throw new DesktopInfrastructureError("Switch Docker Desktop to Linux containers before starting the application.");
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
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(DOCKER_TIMEOUTS_MS.http)]),
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
            if (length > DOCKER_LIMITS.readinessResponseBytes) {
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

/** Recreates this installation's containers on launch and preserves persistent service data. */
export async function ensureDesktopInfrastructure(options: DesktopInfrastructureOptions): Promise<DesktopInfrastructure> {
    let phase: DesktopInfrastructureStepId = DESKTOP_STARTUP_STEP_IDS.docker;
    const report = (id: DesktopInfrastructureStepId, status: DesktopInfrastructureStep["status"], detail: string | null) => {
        options.report({ id, label: DESKTOP_INFRASTRUCTURE_LABELS[id], status, detail });
    };
    try {
        report(DESKTOP_STARTUP_STEP_IDS.docker, DESKTOP_STARTUP_STATUS.running, "Preparing private infrastructure configuration and checking Docker Desktop...");
        const directory = await preparePrivateInfrastructureDirectory(options.runtimeDirectory, options.signal);
        const stackName = infrastructureStackName(options.runtimeDirectory);
        await ensureLocalDocker(options.signal, detail => report(DESKTOP_STARTUP_STEP_IDS.docker, DESKTOP_STARTUP_STATUS.running, detail));
        report(DESKTOP_STARTUP_STEP_IDS.docker, DESKTOP_STARTUP_STATUS.complete, "The local Linux container engine is ready.");

        phase = DESKTOP_STARTUP_STEP_IDS.litellmDatabase;
        report(phase, DESKTOP_STARTUP_STATUS.running, "Loading persisted private service credentials...");
        let credentials = await readInfrastructureCredentials(directory);
        if (credentials === null) {
            for (const filter of [
                `label=${DOCKER_LABELS.runtime}=${infrastructureRuntimeId(directory)}`,
                `label=${DOCKER_LABELS.project}=${legacyInfrastructureStackName(options.runtimeDirectory)}`,
                `label=${DOCKER_LABELS.project}=${stackName}`,
                ...DOCKER_PREVIOUS_PROJECT_NAMES.map(name => `label=${DOCKER_LABELS.project}=${name}`),
            ]) {
                const existingVolumes = await runInfrastructureProcess(DOCKER_EXECUTABLE, ["volume", "ls", "--filter", filter, "--format", DOCKER_INSPECT_FORMATS.names], {
                    signal: options.signal, timeoutMs: DOCKER_TIMEOUTS_MS.cli,
                    failureMessage: "Existing managed data volumes could not be checked safely. Confirm Docker Desktop is available and retry.",
                });
                if (existingVolumes) throw new DesktopInfrastructureError("Managed data exists but its credentials are missing. Restore the private infrastructure directory from backup.");
            }
            credentials = await createInfrastructureCredentials(directory);
        }
        const deployment = await prepareInfrastructureDeployment({ directory, runtimeDirectory: options.runtimeDirectory, signal: options.signal });
        // Download every required image before removing any working containers.
        for (const image of DOCKER_IMAGE_PULLS) {
            phase = image.step;
            report(phase, DESKTOP_STARTUP_STATUS.running, null);
            await runInfrastructureProcess(DOCKER_EXECUTABLE, ["pull", image.image], {
                signal: options.signal,
                timeoutMs: DOCKER_TIMEOUTS_MS.imagePull,
                failureMessage: `The ${image.service} image could not be downloaded. See the backend logs.`,
            });
            report(phase, DESKTOP_STARTUP_STATUS.pending, null);
        }
        phase = DESKTOP_STARTUP_STEP_IDS.litellmDatabase;
        report(phase, DESKTOP_STARTUP_STATUS.running, null);
        await removeOwnedInfrastructureContainers(deployment, options.signal);
        const ports = await prepareInfrastructurePorts({ directory, signal: options.signal });
        const env = await writeInfrastructureConfiguration(directory, options.assetsDirectory, credentials, ports, deployment.litellmDatabaseVolume);
        const composePrefix = ["compose", "--project-name", stackName, "--project-directory", directory, "--file", join(directory, DOCKER_ASSET_FILES.compose), "--env-file", join(directory, DOCKER_ASSET_FILES.environment)];
        const compose = (args: string[], failureMessage: string, timeoutMs: number = DOCKER_TIMEOUTS_MS.cli, onActivity?: () => void) => runInfrastructureProcess(DOCKER_EXECUTABLE, [...composePrefix, ...args], {
            signal: options.signal, cwd: directory, env, timeoutMs, failureMessage, onActivity,
        });
        // The explicit pull must succeed. Avoid a second pull while creating containers from exactly those images.
        await compose(["up", "--detach", "--force-recreate", "--no-build", "--pull", "never"], "The managed infrastructure containers could not start. Check Docker Desktop memory, disk space, and this application's Docker project, then retry.", DOCKER_TIMEOUTS_MS.stackStart);
        const readinessDeadline = Date.now() + DOCKER_TIMEOUTS_MS.serviceReady;

        const serviceId = async (service: string): Promise<string> => {
            const ids = (await compose(["ps", "--all", "--quiet", service], "A managed service container could not be located. Retry startup from Docker Desktop.")).split(/\r?\n/).filter(Boolean);
            if (ids.length !== 1 || !DOCKER_VALIDATION.containerId.test(ids[0])) throw new DesktopInfrastructureError("A managed service container could not be identified safely. Check this application's Docker project and retry.");
            return ids[0];
        };
        const inspect = (id: string, format: string) => runInfrastructureProcess(DOCKER_EXECUTABLE, ["inspect", "--format", format, id], {
            signal: options.signal, env, timeoutMs: DOCKER_TIMEOUTS_MS.cli,
            failureMessage: "Managed service health could not be inspected. Confirm Docker Desktop is running and retry.",
        });
        const ready = async (service: string): Promise<string> => {
            const id = await serviceId(service);
            for (;;) {
                const state = await inspect(id, DOCKER_INSPECT_FORMATS.state);
                if (state === `${DOCKER_CONTAINER_STATUS.running}|${DOCKER_CONTAINER_STATUS.healthy}`) return id;
                if (state.startsWith(`${DOCKER_CONTAINER_STATUS.exited}|`) || state.startsWith(`${DOCKER_CONTAINER_STATUS.dead}|`) || state.endsWith(`|${DOCKER_CONTAINER_STATUS.unhealthy}`)) {
                    throw new DesktopInfrastructureError(`${service} failed its health check. Check this container in Docker Desktop and retry.`);
                }
                if (Date.now() >= readinessDeadline) throw new DesktopInfrastructureError(`${service} did not become ready. Check this container in Docker Desktop and retry.`);
                await startupDelay(DOCKER_TIMEOUTS_MS.pollInterval, options.signal);
            }
        };
        const publishedUrl = async (id: string, targetPort: number): Promise<string> => {
            let bindings: unknown;
            try { bindings = JSON.parse(await inspect(id, DOCKER_INSPECT_FORMATS.ports)); }
            catch (error) { if (error instanceof DesktopInfrastructureError) throw error; throw new DesktopInfrastructureError("A managed service's private host port could not be read safely."); }
            const ports = responseObject(bindings);
            const entries = ports?.[`${targetPort}/tcp`];
            if (!Array.isArray(entries) || entries.length !== 1) throw new DesktopInfrastructureError("A managed service does not have exactly one private loopback port. Startup stopped to prevent an unsafe network connection.");
            const binding = responseObject(entries[0]);
            const port = Number(binding?.HostPort);
            if (binding?.HostIp !== LOOPBACK_HOST || !Number.isInteger(port) || port < PRIVATE_PORT_RANGE.minimum || port > PRIVATE_PORT_RANGE.maximum) {
                throw new DesktopInfrastructureError("A managed service port is outside the private loopback allocation policy. Startup stopped to prevent an unsafe network connection.");
            }
            return `${DOCKER_PROTOCOLS.http}//${LOOPBACK_HOST}:${port}`;
        };

        report(DESKTOP_STARTUP_STEP_IDS.litellmDatabase, DESKTOP_STARTUP_STATUS.running, "Waiting for the dedicated LiteLLM PostgreSQL database...");
        await ready(DOCKER_SERVICE_NAMES.litellmDatabase);
        report(DESKTOP_STARTUP_STEP_IDS.litellmDatabase, DESKTOP_STARTUP_STATUS.complete, "The private LiteLLM database is healthy.");

        phase = DESKTOP_STARTUP_STEP_IDS.milvus;
        report(phase, DESKTOP_STARTUP_STATUS.running, null);
        const milvusId = await ready(DOCKER_SERVICE_NAMES.milvus);
        const milvusUrl = await publishedUrl(milvusId, SERVICE_PORTS.milvus);
        const milvusToken = `${DOCKER_CREDENTIAL_SETTINGS.milvusRootUsername}:${credentials.milvusRootPassword}`;
        const milvus = responseObject(await infrastructureJson(`${milvusUrl}${DOCKER_HEALTH_ENDPOINTS.milvusCollections}`, { signal: options.signal, authorization: milvusToken, body: {} }));
        if (milvus?.code !== DOCKER_HEALTH_VALUES.milvusSuccess || !Array.isArray(milvus.data)) throw new DesktopInfrastructureError("Milvus did not pass its authenticated startup check. Restore its saved credentials or inspect the managed Milvus service before retrying.");
        report(phase, DESKTOP_STARTUP_STATUS.complete, "Milvus is healthy and authenticated access is verified.");

        phase = DESKTOP_STARTUP_STEP_IDS.litellm;
        report(phase, DESKTOP_STARTUP_STATUS.running, "Waiting for LiteLLM database migrations and authenticated gateway readiness...");
        const litellmId = await ready(DOCKER_SERVICE_NAMES.litellm);
        const litellmUrl = await publishedUrl(litellmId, SERVICE_PORTS.litellm);
        const health = responseObject(await infrastructureJson(`${litellmUrl}${DOCKER_HEALTH_ENDPOINTS.litellmReadiness}`, { signal: options.signal }));
        if (health?.status !== DOCKER_HEALTH_VALUES.healthy || health.db !== DOCKER_HEALTH_VALUES.databaseConnected) throw new DesktopInfrastructureError("LiteLLM is not ready with its PostgreSQL database. Check the managed gateway and database services, then retry.");
        const models = responseObject(await infrastructureJson(`${litellmUrl}${DOCKER_HEALTH_ENDPOINTS.litellmModels}`, { signal: options.signal, authorization: credentials.litellmMasterKey }));
        if (!Array.isArray(models?.data)) throw new DesktopInfrastructureError("LiteLLM did not pass its authenticated startup check. Restore its saved private credentials before retrying.");
        report(phase, DESKTOP_STARTUP_STATUS.complete, "LiteLLM is ready with its private database and verified master key.");
        phase = DESKTOP_STARTUP_STEP_IDS.applicationDatabase;
        report(phase, DESKTOP_STARTUP_STATUS.running, null);
        const applicationDatabaseId = await ready(DOCKER_SERVICE_NAMES.applicationDatabase);
        const applicationDatabasePort = new URL(await publishedUrl(applicationDatabaseId, SERVICE_PORTS.postgresql)).port;
        const applicationDatabaseAddress = new URL(`${DOCKER_PROTOCOLS.postgresql}//${LOOPBACK_HOST}:${applicationDatabasePort}`);
        applicationDatabaseAddress.username = credentials.appPostgresUsername;
        applicationDatabaseAddress.password = credentials.appPostgresPassword;
        applicationDatabaseAddress.pathname = `/${credentials.appPostgresDatabase}`;
        return { stackName, litellmUrl, litellmMasterKey: credentials.litellmMasterKey, milvusUrl, milvusToken,
            applicationDatabaseUrl: applicationDatabaseAddress.toString() };
    } catch (error) {
        const safe = error instanceof DesktopInfrastructureError ? error : new DesktopInfrastructureError(options.signal.aborted
            ? "Desktop infrastructure startup was cancelled."
            : "Desktop infrastructure could not initialize safely. Check Docker Desktop and the application's private runtime directory, then retry.");
        report(phase, DESKTOP_STARTUP_STATUS.error, safe.message);
        throw safe;
    }
}
