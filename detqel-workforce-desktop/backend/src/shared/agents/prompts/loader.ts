import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, open, rename, rm, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { AppError } from "../../errors/app-error.js";
import { createScopedLogger } from "../../logging/logger.js";
import { renderMarkdownPrompt, validatePrompt } from "./renderer.js";
import { PROMPT_BASE_TONE, PROMPT_ERRORS, PROMPT_FILE_EXTENSION, PROMPT_FILE_MODES, PROMPT_GLOBAL_GUIDANCE_ID, PROMPT_ID_PATTERN, PROMPT_MAX_FILE_BYTES, PROMPT_TEMP } from "../../../constants/promptConstants.js";
import { DESKTOP_PLATFORM } from "../../../constants/desktopConstants.js";

const logger = createScopedLogger("prompt-loader");
export interface PromptLoaderRoots { readonly bundledDirectory: string; readonly runtimeDirectory: string }
export interface RenderAgentPromptOptions { readonly variables?: Readonly<Record<string, string>>; readonly includeGlobalGuidance?: boolean }

export class PromptLoader {
    constructor(private readonly roots: PromptLoaderRoots) {
        if (!isAbsolute(roots.bundledDirectory) || !isAbsolute(roots.runtimeDirectory)) throw new AppError(500, "Prompt roots must be absolute paths.");
    }

    async renderAgentPrompt(agentId: string, options: RenderAgentPromptOptions = {}): Promise<string> {
        const path = await this.locate(agentId);
        if (path === null) throw new AppError(404, PROMPT_ERRORS.notFound);
        const rendered = renderMarkdownPrompt(await this.readBounded(path), options.variables);
        if (!options.includeGlobalGuidance) return rendered;
        const guidancePath = await this.locate(PROMPT_GLOBAL_GUIDANCE_ID);
        if (guidancePath === null) throw new AppError(500, "The global Markdown guidance file is missing.");
        return `${rendered}\n\n## Global guidance\n${PROMPT_BASE_TONE}\n${renderMarkdownPrompt(await this.readBounded(guidancePath))}`;
    }

    async hasAgentPrompt(agentId: string): Promise<boolean> { return (await this.locate(agentId)) !== null; }

    async writeUserAgentPrompt(agentId: string, source: string): Promise<void> {
        const target = this.filePath(this.roots.runtimeDirectory, agentId);
        validatePrompt(source);
        await mkdir(this.roots.runtimeDirectory, { recursive: true, mode: PROMPT_FILE_MODES.directory });
        if (process.platform !== DESKTOP_PLATFORM.windows) await chmod(this.roots.runtimeDirectory, PROMPT_FILE_MODES.directory);
        const temporary = join(this.roots.runtimeDirectory, `${PROMPT_TEMP.prefix}${randomBytes(PROMPT_TEMP.randomBytes).toString(PROMPT_TEMP.encoding)}${PROMPT_TEMP.suffix}`);
        try {
            await writeFile(temporary, source, { encoding: "utf8", mode: PROMPT_FILE_MODES.file, flag: "wx" });
            await rename(temporary, target);
        } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
        logger.info({ agentId }, "Saved Markdown agent prompt");
    }

    async readUserAgentPrompt(agentId: string): Promise<string | null> {
        const path = this.filePath(this.roots.runtimeDirectory, agentId);
        return await this.exists(path) ? this.readBounded(path) : null;
    }

    async deleteUserAgentPrompt(agentId: string): Promise<void> { await rm(this.filePath(this.roots.runtimeDirectory, agentId), { force: true }); }

    private async locate(agentId: string): Promise<string | null> {
        for (const root of [this.roots.runtimeDirectory, this.roots.bundledDirectory]) {
            const path = this.filePath(root, agentId);
            if (await this.exists(path)) return path;
        }
        return null;
    }

    private filePath(root: string, id: string): string {
        if (!PROMPT_ID_PATTERN.test(id)) throw new AppError(400, PROMPT_ERRORS.invalidId);
        const path = resolve(join(root, `${id}${PROMPT_FILE_EXTENSION}`));
        const inside = relative(resolve(root), path);
        if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new AppError(400, PROMPT_ERRORS.invalidId);
        return path;
    }

    private async exists(path: string): Promise<boolean> {
        try {
            const info = await lstat(path);
            if (!info.isFile() || info.isSymbolicLink()) throw new AppError(422, "An agent prompt must be a regular Markdown file.");
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
            throw error;
        }
    }

    private async readBounded(path: string): Promise<string> {
        const before = await lstat(path);
        if (!before.isFile() || before.isSymbolicLink()) throw new AppError(422, "An agent prompt must be a regular Markdown file.");
        const handle = await open(path, "r");
        try {
            const info = await handle.stat();
            if (!info.isFile() || info.ino !== before.ino || info.dev !== before.dev) throw new AppError(422, PROMPT_ERRORS.unreadable);
            if (info.size > PROMPT_MAX_FILE_BYTES) throw new AppError(422, PROMPT_ERRORS.oversized);
            const buffer = Buffer.alloc(PROMPT_MAX_FILE_BYTES + 1);
            let size = 0;
            while (size < buffer.length) {
                const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
                if (!bytesRead) break;
                size += bytesRead;
            }
            if (size > PROMPT_MAX_FILE_BYTES) throw new AppError(422, PROMPT_ERRORS.oversized);
            const source = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size));
            validatePrompt(source);
            return source;
        } finally { await handle.close(); }
    }
}
