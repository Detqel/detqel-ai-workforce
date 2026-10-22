import { resolve } from "node:path";
import { APPLICATION_NAMESPACE } from "../../constants/commonConstants.js";
import { DESKTOP_PLATFORM } from "../../constants/desktopConstants.js";
import {
    DOCKER_CONTAINER_PATHS,
    DOCKER_EXECUTABLE,
    DOCKER_INSPECT_FORMATS,
    DOCKER_LABELS,
    DOCKER_LEGACY,
    DOCKER_LEGACY_SERVICES,
    DOCKER_LIMITS,
    DOCKER_MANAGED_SERVICES,
    DOCKER_NETWORK_NAMES,
    DOCKER_PREVIOUS_PROJECT_NAMES,
    DOCKER_PREVIOUS_CONTAINER_NAMES,
    DOCKER_PREVIOUS_SERVICE_NAMES,
    DOCKER_PROJECT_NAME,
    DOCKER_SERVICE_NAMES,
    DOCKER_TIMEOUTS_MS,
    DOCKER_VALIDATION,
    DOCKER_VOLUME_NAMES,
} from "../../constants/dockerConstants.js";
import { infrastructureRuntimeId, legacyInfrastructureStackName } from "./infrastructure-configuration.js";
import { DesktopInfrastructureError } from "./infrastructure-error.js";
import { runInfrastructureProcess } from "./infrastructure-process.js";

interface ContainerDescription {
    name: string;
    labels: Record<string, string>;
    mounts: { Type: string; Name?: string; Destination: string }[];
    ports: Record<string, { HostIp: string; HostPort: string }[] | null>;
    status: string;
}

export interface InfrastructureDeployment {
    litellmDatabaseVolume: string;
    containerIds: string[];
}

function canonicalPath(value: string): string {
    const absolute = resolve(value);
    return process.platform === DESKTOP_PLATFORM.windows ? absolute.toLowerCase() : absolute;
}

/** Inspect only ownership, mounts and ports; never capture container environment credentials. */
export async function prepareInfrastructureDeployment(options: {
    directory: string;
    runtimeDirectory: string;
    signal: AbortSignal;
}): Promise<InfrastructureDeployment> {
    const docker = (args: string[]) => runInfrastructureProcess(DOCKER_EXECUTABLE, args, {
        signal: options.signal, timeoutMs: DOCKER_TIMEOUTS_MS.ownershipCli,
        failureMessage: "Managed Docker ownership could not be checked safely. Check Docker Desktop and retry.",
    });
    const runtimeId = infrastructureRuntimeId(options.directory);
    const legacyStack = legacyInfrastructureStackName(options.runtimeDirectory);
    const ids = async (filter: string): Promise<string[]> => {
        const output = await docker(["ps", "--all", "--filter", filter, "--format", DOCKER_INSPECT_FORMATS.ids]);
        const values = output.split(/\r?\n/).filter(Boolean);
        if (values.some(value => !DOCKER_VALIDATION.containerId.test(value))) throw new DesktopInfrastructureError("Managed Docker container identifiers are invalid.");
        return values;
    };
    const inspect = async (id: string): Promise<ContainerDescription> => {
        return JSON.parse(await docker(["inspect", "--format", DOCKER_INSPECT_FORMATS.container, id])) as ContainerDescription;
    };
    let litellmDatabaseVolume: string | undefined;
    const ownContainers = new Set([
        ...await ids(`label=${DOCKER_LABELS.project}=${DOCKER_PROJECT_NAME}`),
        ...await ids(`name=^/${APPLICATION_NAMESPACE}-`),
        ...await ids(`label=${DOCKER_LABELS.project}=${DOCKER_PREVIOUS_PROJECT_NAMES[0]}`),
    ]);
    for (const id of ownContainers) {
        const container = await inspect(id);
        const name = container.name.replace(/^\//, "");
        const previousProject = (DOCKER_PREVIOUS_PROJECT_NAMES as readonly string[]).includes(container.labels?.[DOCKER_LABELS.project]);
        if ((!DOCKER_MANAGED_SERVICES.has(name) && !(previousProject && DOCKER_PREVIOUS_CONTAINER_NAMES.has(name)))
            || container.labels?.[DOCKER_LABELS.runtime] !== runtimeId
            || !([DOCKER_PROJECT_NAME, ...DOCKER_PREVIOUS_PROJECT_NAMES] as readonly string[]).includes(container.labels[DOCKER_LABELS.project])) {
            throw new DesktopInfrastructureError(`The ${DOCKER_PROJECT_NAME} Docker names are already owned by another installation. Stop that installation before starting this workspace.`);
        }
        if (name === DOCKER_SERVICE_NAMES.litellmDatabase
            || (previousProject && name === DOCKER_PREVIOUS_SERVICE_NAMES.litellmDatabase)
            || container.labels[DOCKER_LABELS.service] === DOCKER_SERVICE_NAMES.litellmDatabase) {
            litellmDatabaseVolume = container.mounts.find(mount => mount.Type === "volume" && mount.Destination === DOCKER_CONTAINER_PATHS.postgresqlData)?.Name;
        }
    }
    for (const name of [DOCKER_VOLUME_NAMES.applicationDatabase, DOCKER_VOLUME_NAMES.milvus]) {
        const names = (await docker(["volume", "ls", "--filter", `name=^${name}$`, "--format", DOCKER_INSPECT_FORMATS.names])).split(/\r?\n/).filter(Boolean);
        if (names.length === 0) {
            await docker(["volume", "create", "--label", `${DOCKER_LABELS.runtime}=${runtimeId}`, name]);
            continue;
        }
        const labels = JSON.parse(await docker(["volume", "inspect", "--format", DOCKER_INSPECT_FORMATS.labels, name])) as Record<string, string> | null;
        if (names.length !== 1 || labels?.[DOCKER_LABELS.runtime] !== runtimeId) {
            throw new DesktopInfrastructureError(`A ${DOCKER_PROJECT_NAME} data volume belongs to another installation. Existing data has been preserved.`);
        }
    }

    for (const name of Object.values(DOCKER_NETWORK_NAMES)) {
        const names = (await docker(["network", "ls", "--filter", `name=^${name}$`, "--format", DOCKER_INSPECT_FORMATS.names])).split(/\r?\n/).filter(Boolean);
        if (names.length === 0) {
            await docker(["network", "create", "--label", `${DOCKER_LABELS.runtime}=${runtimeId}`,
                ...(name === DOCKER_NETWORK_NAMES.litellmPrivate ? ["--internal"] : []), name]);
            continue;
        }
        const network = JSON.parse(await docker(["network", "inspect", "--format", DOCKER_INSPECT_FORMATS.network, name])) as { labels: Record<string, string> | null; internal: boolean };
        if (names.length !== 1 || network.labels?.[DOCKER_LABELS.runtime] !== runtimeId
            || (name === DOCKER_NETWORK_NAMES.litellmPrivate && !network.internal)) {
            throw new DesktopInfrastructureError("A managed Docker network has incompatible ownership or privacy settings. No existing data was removed.");
        }
    }

    const legacyContainerIds = await ids(`label=${DOCKER_LABELS.project}=${legacyStack}`);
    for (const id of legacyContainerIds) {
        const container = await inspect(id);
        const workingDirectory = container.labels?.[DOCKER_LABELS.workingDirectory];
        const service = container.labels?.[DOCKER_LABELS.service];
        if (!workingDirectory || canonicalPath(workingDirectory) !== canonicalPath(options.directory)
            || !DOCKER_LEGACY_SERVICES.has(service)) {
            throw new DesktopInfrastructureError("Legacy desktop containers could not be verified safely. No containers or data volumes were removed.");
        }
        if (service === DOCKER_LEGACY.litellmDatabaseService) {
            const previousVolume = container.mounts.find(mount => mount.Type === "volume" && mount.Destination === DOCKER_CONTAINER_PATHS.postgresqlData)?.Name;
            if (!previousVolume || (litellmDatabaseVolume && litellmDatabaseVolume !== previousVolume)) {
                throw new DesktopInfrastructureError("Conflicting LiteLLM database volumes require recovery before startup. Existing data has been preserved.");
            }
            litellmDatabaseVolume = previousVolume;
        }
    }
    // A prior failed deployment may have lost its containers while retaining the database volume.
    if (!litellmDatabaseVolume) {
        const legacyVolumes = (await docker(["volume", "ls", "--filter", `label=${DOCKER_LABELS.project}=${legacyStack}`,
            "--filter", `label=${DOCKER_LABELS.volume}=${DOCKER_LEGACY.litellmDatabaseVolume}`, "--format", DOCKER_INSPECT_FORMATS.names])).split(/\r?\n/).filter(Boolean);
        if (legacyVolumes.length > 1) throw new DesktopInfrastructureError("Multiple legacy LiteLLM database volumes were found. Existing data has been preserved for recovery.");
        litellmDatabaseVolume = legacyVolumes[0];
    }
    litellmDatabaseVolume ??= DOCKER_VOLUME_NAMES.litellmDatabase;
    if (!DOCKER_VALIDATION.legacyVolumeName.test(litellmDatabaseVolume)) throw new DesktopInfrastructureError("The managed database volume name is invalid.");
    const volumeNames = (await docker(["volume", "ls", "--filter", `name=^${litellmDatabaseVolume}$`, "--format", DOCKER_INSPECT_FORMATS.names])).split(/\r?\n/).filter(Boolean);
    if (volumeNames.length === 0 && litellmDatabaseVolume === DOCKER_VOLUME_NAMES.litellmDatabase) {
        await docker(["volume", "create", "--label", `${DOCKER_LABELS.runtime}=${runtimeId}`, DOCKER_VOLUME_NAMES.litellmDatabase]);
    } else {
        if (volumeNames.length !== 1 || volumeNames[0] !== litellmDatabaseVolume) throw new DesktopInfrastructureError("The saved LiteLLM database volume is missing. Restore it before restarting.");
        const labels = JSON.parse(await docker(["volume", "inspect", "--format", DOCKER_INSPECT_FORMATS.labels, litellmDatabaseVolume])) as Record<string, string> | null;
        if (labels?.[DOCKER_LABELS.runtime] !== runtimeId && labels?.[DOCKER_LABELS.project] !== legacyStack) {
            throw new DesktopInfrastructureError("The LiteLLM database volume belongs to another installation. Existing data has been preserved.");
        }
    }
    return { litellmDatabaseVolume, containerIds: [...new Set([...ownContainers, ...legacyContainerIds])] };
}

/** Recreate only this installation's verified containers; persistent volumes and networks survive. */
export async function removeOwnedInfrastructureContainers(deployment: InfrastructureDeployment, signal: AbortSignal): Promise<void> {
    if (!deployment.containerIds.length) return;
    await runInfrastructureProcess(DOCKER_EXECUTABLE, ["stop", "--time", String(DOCKER_LIMITS.legacyStopSeconds), ...deployment.containerIds], {
        signal, timeoutMs: DOCKER_TIMEOUTS_MS.legacyReplacement,
        failureMessage: "The previous desktop containers could not be stopped safely. Close the previous desktop instance and retry.",
    });
    await runInfrastructureProcess(DOCKER_EXECUTABLE, ["rm", ...deployment.containerIds], {
        signal, timeoutMs: DOCKER_TIMEOUTS_MS.legacyReplacement,
        failureMessage: "The previous desktop containers could not be replaced. Their data volumes have been preserved; close the previous desktop instance and retry.",
    });
}
