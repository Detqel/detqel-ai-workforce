import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { AppError } from "../errors/app-error.js";
import { createScopedLogger } from "../logging/logger.js";
import {
    AGENTS_CONFIG_ERRORS,
    AGENTS_CONFIG_FILE,
    AGENTS_CONFIG_FILE_MODES,
    AGENTS_CONFIG_TEMP,
    AGENTS_CONFIG_VERSION,
} from "../../constants/agentsConfigConstants.js";
import {
    AGENT_RUNTIME_PROCESS_IDS,
    type AgentRuntimeProcessId,
} from "../../constants/agentRuntimeConstants.js";
import { DESKTOP_PLATFORM } from "../../constants/desktopConstants.js";

const logger = createScopedLogger("agents-config");

export interface AgentProcessConfig {
    /** Gateway model alias this process calls. */
    readonly modelAlias: string;
    /** Gateway virtual-key id used to authorise the process. The key value itself is never written here. */
    readonly gatewayKeyId: string;
}

export interface AgentsConfig {
    readonly version: number;
    readonly workspaceId: string;
    readonly generatedAt: string;
    readonly processes: Readonly<Record<AgentRuntimeProcessId, AgentProcessConfig>>;
}

function configPath(runtimeDirectory: string): string {
    if (!isAbsolute(runtimeDirectory)) throw new AppError(500, "The agent runtime directory must be an absolute path.");
    return join(resolve(runtimeDirectory), AGENTS_CONFIG_FILE);
}

/**
 * Writes agents.config.json atomically into the runtime directory with owner-only permissions. The directory
 * is expected to already be hardened (runtime dir created with 0o700 / Windows ACLs); this applies the same
 * file mode on non-Windows for defence in depth.
 */
export async function writeAgentsConfig(runtimeDirectory: string, config: AgentsConfig): Promise<void> {
    const directory = resolve(runtimeDirectory);
    await mkdir(directory, { recursive: true, mode: AGENTS_CONFIG_FILE_MODES.directory });
    const target = configPath(runtimeDirectory);
    const temporary = join(directory, `${AGENTS_CONFIG_TEMP.prefix}${randomBytes(AGENTS_CONFIG_TEMP.randomBytes).toString(AGENTS_CONFIG_TEMP.encoding)}${AGENTS_CONFIG_TEMP.suffix}`);
    try {
        await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: AGENTS_CONFIG_FILE_MODES.file });
        if (process.platform !== DESKTOP_PLATFORM.windows) await chmod(temporary, AGENTS_CONFIG_FILE_MODES.file);
        await rename(temporary, target);
    } catch (error) {
        await unlink(temporary).catch(() => {});
        throw error;
    }
    logger.info({ workspaceId: config.workspaceId, processes: Object.keys(config.processes).length }, "Wrote agents.config.json");
}

/**
 * Builds the config object mapping every process to the single configured model and its virtual-key id.
 * Fails fast if any required process is missing a mapping so a partial configuration never reaches disk.
 */
export function buildAgentsConfig(workspaceId: string, perProcess: Readonly<Record<AgentRuntimeProcessId, AgentProcessConfig>>): AgentsConfig {
    for (const processId of AGENT_RUNTIME_PROCESS_IDS) {
        const entry = perProcess[processId];
        if (!entry || !entry.modelAlias || !entry.gatewayKeyId) throw new AppError(500, AGENTS_CONFIG_ERRORS.incompleteProcesses);
    }
    return { version: AGENTS_CONFIG_VERSION, workspaceId, generatedAt: new Date().toISOString(), processes: perProcess };
}

/** Reads and strictly validates agents.config.json, failing fast on anything malformed or incomplete. */
export async function loadAgentsConfig(runtimeDirectory: string): Promise<AgentsConfig> {
    let raw: string;
    try {
        raw = await readFile(configPath(runtimeDirectory), "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AppError(409, AGENTS_CONFIG_ERRORS.missing);
        throw new AppError(500, AGENTS_CONFIG_ERRORS.unreadable);
    }
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        throw new AppError(500, AGENTS_CONFIG_ERRORS.malformed);
    }
    return validateAgentsConfig(value);
}

function validateAgentsConfig(value: unknown): AgentsConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError(500, AGENTS_CONFIG_ERRORS.malformed);
    const candidate = value as Record<string, unknown>;
    if (candidate.version !== AGENTS_CONFIG_VERSION || typeof candidate.workspaceId !== "string" || typeof candidate.generatedAt !== "string") {
        throw new AppError(500, AGENTS_CONFIG_ERRORS.malformed);
    }
    const processes = candidate.processes;
    if (!processes || typeof processes !== "object" || Array.isArray(processes)) throw new AppError(500, AGENTS_CONFIG_ERRORS.malformed);
    const processMap = processes as Record<string, unknown>;
    const validated = {} as Record<AgentRuntimeProcessId, AgentProcessConfig>;
    for (const processId of AGENT_RUNTIME_PROCESS_IDS) {
        const entry = processMap[processId];
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new AppError(500, AGENTS_CONFIG_ERRORS.incompleteProcesses);
        const mapping = entry as Record<string, unknown>;
        if (typeof mapping.modelAlias !== "string" || !mapping.modelAlias || typeof mapping.gatewayKeyId !== "string" || !mapping.gatewayKeyId) {
            throw new AppError(500, AGENTS_CONFIG_ERRORS.incompleteProcesses);
        }
        validated[processId] = { modelAlias: mapping.modelAlias, gatewayKeyId: mapping.gatewayKeyId };
    }
    return { version: AGENTS_CONFIG_VERSION, workspaceId: candidate.workspaceId, generatedAt: candidate.generatedAt, processes: validated };
}
