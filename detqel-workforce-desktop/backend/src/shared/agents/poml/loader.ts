import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { AppError } from "../../errors/app-error.js";
import { createScopedLogger } from "../../logging/logger.js";
import { applyTemplate, parsePoml, renderPoml } from "./renderer.js";
import {
    POML_BASE_TONE,
    POML_ERRORS,
    POML_FILE_EXTENSION,
    POML_FILE_MODES,
    POML_GLOBAL_GUIDANCE_ID,
    POML_ID_PATTERN,
    POML_MAX_FILE_BYTES,
    POML_TEMP,
} from "../../../constants/pomlConstants.js";
import { DESKTOP_PLATFORM } from "../../../constants/desktopConstants.js";

const logger = createScopedLogger("poml-loader");

export interface PomlLoaderRoots {
    /** Read-only bundled directory shipped with the application (platform/seed agent prompts). */
    readonly bundledDirectory: string;
    /** Writable, hardened directory for user-authored agent prompts, resolved by agent id. */
    readonly runtimeDirectory: string;
}

export interface RenderAgentPromptOptions {
    readonly variables?: Readonly<Record<string, string>>;
    /** When true, the one global-guidance prompt is appended beneath the agent's own sections. */
    readonly includeGlobalGuidance?: boolean;
}

/**
 * Loads and renders agent prompts from POML files. User prompts live in the writable runtime root and take
 * precedence; platform/seed prompts live in the read-only bundled root. Agent ids are validated to a safe
 * token so a lookup can never escape either directory. The loader never reads prompt text from the database.
 */
export class PomlLoader {
    constructor(private readonly roots: PomlLoaderRoots) {
        if (!isAbsolute(roots.bundledDirectory) || !isAbsolute(roots.runtimeDirectory)) {
            throw new AppError(500, "POML roots must be absolute paths.");
        }
    }

    /** Renders the final system prompt for an agent, optionally appending the global guidance. */
    async renderAgentPrompt(agentId: string, options: RenderAgentPromptOptions = {}): Promise<string> {
        const source = await this.readAgentSource(agentId);
        const substituted = options.variables ? applyTemplate(source, options.variables) : source;
        const parsed = parsePoml(substituted);
        const extraGuidance = options.includeGlobalGuidance ? await this.resolveGlobalGuidance() : undefined;
        return renderPoml(parsed, { extraGuidance });
    }

    /** True when a POML prompt exists for the agent in either root. */
    async hasAgentPrompt(agentId: string): Promise<boolean> {
        return (await this.locate(agentId)) !== null;
    }

    /**
     * Writes a user-authored agent prompt into the hardened runtime root. The directory is created with
     * owner-only permissions and the write is atomic. Overwrites a prior prompt for the same agent id.
     */
    async writeUserAgentPrompt(agentId: string, pomlSource: string): Promise<void> {
        const safeId = this.assertValidId(agentId);
        // Validate before persisting so a malformed prompt never reaches disk.
        parsePoml(pomlSource);
        await mkdir(this.roots.runtimeDirectory, { recursive: true, mode: POML_FILE_MODES.directory });
        const target = join(this.roots.runtimeDirectory, `${safeId}${POML_FILE_EXTENSION}`);
        const temporary = join(this.roots.runtimeDirectory, `${POML_TEMP.prefix}${randomBytes(POML_TEMP.randomBytes).toString(POML_TEMP.encoding)}${POML_TEMP.suffix}`);
        try {
            await writeFile(temporary, pomlSource, { mode: POML_FILE_MODES.file });
            if (process.platform !== DESKTOP_PLATFORM.windows) await chmod(temporary, POML_FILE_MODES.file);
            await rename(temporary, target);
        } catch (error) {
            await unlink(temporary).catch(() => {});
            throw error;
        }
        logger.info({ agentId: safeId }, "Wrote user agent POML prompt");
    }

    /** The raw source of an agent prompt in the runtime root, or null when the runtime root has none. */
    async readUserAgentPrompt(agentId: string): Promise<string | null> {
        const safeId = this.assertValidId(agentId);
        const target = join(this.roots.runtimeDirectory, `${safeId}${POML_FILE_EXTENSION}`);
        try {
            if (!(await stat(target)).isFile()) return null;
        } catch {
            return null;
        }
        return this.readFileBounded(target);
    }

    /** Removes a user-authored agent prompt from the runtime root. No-op when absent. */
    async deleteUserAgentPrompt(agentId: string): Promise<void> {
        const safeId = this.assertValidId(agentId);
        await rm(join(this.roots.runtimeDirectory, `${safeId}${POML_FILE_EXTENSION}`), { force: true });
    }

    private async resolveGlobalGuidance(): Promise<string> {
        const located = await this.locate(POML_GLOBAL_GUIDANCE_ID);
        if (!located) return POML_BASE_TONE;
        const parsed = parsePoml(await this.readFileBounded(located));
        const rendered = renderPoml(parsed);
        return `${POML_BASE_TONE}\n${rendered}`;
    }

    private async readAgentSource(agentId: string): Promise<string> {
        const located = await this.locate(agentId);
        if (!located) throw new AppError(404, POML_ERRORS.notFound);
        return this.readFileBounded(located);
    }

    /** Returns the file path for an agent id, preferring the runtime root, or null when neither exists. */
    private async locate(agentId: string): Promise<string | null> {
        const safeId = this.assertValidId(agentId);
        const fileName = `${safeId}${POML_FILE_EXTENSION}`;
        for (const directory of [this.roots.runtimeDirectory, this.roots.bundledDirectory]) {
            const candidate = join(directory, fileName);
            // The resolved path must remain inside the root even though the id is already validated.
            if (!resolve(candidate).startsWith(resolve(directory))) continue;
            try {
                if ((await stat(candidate)).isFile()) return candidate;
            } catch {
                // Not present in this root; try the next.
            }
        }
        return null;
    }

    private async readFileBounded(path: string): Promise<string> {
        const info = await stat(path);
        if (info.size > POML_MAX_FILE_BYTES) throw new AppError(500, POML_ERRORS.oversized);
        try {
            return await readFile(path, "utf8");
        } catch {
            throw new AppError(500, POML_ERRORS.unreadable);
        }
    }

    private assertValidId(agentId: string): string {
        if (!POML_ID_PATTERN.test(agentId)) throw new AppError(400, POML_ERRORS.invalidId);
        return agentId;
    }
}
