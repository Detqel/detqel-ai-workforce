import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { chmod, mkdir, readFile, readdir, rename, rm, unlink, writeFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { AppError } from "../errors/app-error.js";
import { createScopedLogger } from "../logging/logger.js";
import {
    FILE_SERVER_BLOCKED_EXTENSIONS,
    FILE_SERVER_BLOCKED_MIME_TYPES,
    FILE_SERVER_DEFAULT_ROOTS,
    FILE_SERVER_ENV_OVERRIDE,
    FILE_SERVER_ERRORS,
    FILE_SERVER_FILE_MODES,
    FILE_SERVER_ID_PATTERN,
    FILE_SERVER_SESSION_DIRECTORIES,
    FILE_SERVER_TEMP,
    type FileServerScope,
} from "../../constants/fileServerConstants.js";
import { DESKTOP_PLATFORM } from "../../constants/desktopConstants.js";

const logger = createScopedLogger("file-server");

export interface SessionLocation {
    readonly workspaceId: string;
    readonly scope: FileServerScope;
    readonly sessionId: string;
}

export interface StoredFile {
    readonly name: string;
    readonly path: string;
    readonly size: number;
}

/** Resolves the platform-appropriate file-server base directory, honouring the environment override. */
export function resolveFileServerBase(): string {
    const override = process.env[FILE_SERVER_ENV_OVERRIDE];
    if (override && override.trim().length > 0) return resolve(override.trim());
    if (process.platform === DESKTOP_PLATFORM.windows) return FILE_SERVER_DEFAULT_ROOTS.windows;
    if (process.platform === "darwin") return join(homedir(), FILE_SERVER_DEFAULT_ROOTS.macosRelativeToHome);
    return join(homedir(), FILE_SERVER_DEFAULT_ROOTS.linuxRelativeToHome);
}

/**
 * Owns the per-session file tree used by RAG. Every path segment is validated so it cannot escape the base,
 * directories are created owner-only (Windows ACLs are applied to the base by the caller's runtime setup, and
 * POSIX modes are enforced here), and uploads reject executable/script content. There is no size limit.
 */
export class FileServer {
    private readonly base: string;

    constructor(base: string = resolveFileServerBase()) {
        this.base = resolve(base);
    }

    /** Ensures a session's chat and knowledge directories exist and returns the session directory path. */
    async ensureSession(location: SessionLocation): Promise<string> {
        const sessionDirectory = this.sessionDirectory(location);
        for (const sub of Object.values(FILE_SERVER_SESSION_DIRECTORIES)) {
            await this.makeHardenedDirectory(join(sessionDirectory, sub));
        }
        return sessionDirectory;
    }

    /**
     * Stores an uploaded knowledge file for a session. Rejects executable/script content by extension and MIME
     * type. The write is atomic. Returns the stored file descriptor.
     */
    async storeKnowledgeFile(location: SessionLocation, fileName: string, mimeType: string, contents: Buffer): Promise<StoredFile> {
        this.assertSafeFileName(fileName);
        this.assertAllowedType(fileName, mimeType);
        const directory = join(this.sessionDirectory(location), FILE_SERVER_SESSION_DIRECTORIES.knowledge);
        await this.makeHardenedDirectory(directory);
        const target = join(directory, fileName);
        const temporary = join(directory, `${FILE_SERVER_TEMP.prefix}${randomBytes(FILE_SERVER_TEMP.randomBytes).toString(FILE_SERVER_TEMP.encoding)}${FILE_SERVER_TEMP.suffix}`);
        try {
            await writeFile(temporary, contents, { mode: FILE_SERVER_FILE_MODES.file });
            if (process.platform !== DESKTOP_PLATFORM.windows) await chmod(temporary, FILE_SERVER_FILE_MODES.file);
            await rename(temporary, target);
        } catch (error) {
            await unlink(temporary).catch(() => {});
            throw error;
        }
        logger.info({ workspaceId: location.workspaceId, sessionId: location.sessionId, fileName }, "Stored session knowledge file");
        return { name: fileName, path: target, size: contents.byteLength };
    }

    /** Lists the knowledge files stored for a session. */
    async listKnowledgeFiles(location: SessionLocation): Promise<StoredFile[]> {
        const directory = join(this.sessionDirectory(location), FILE_SERVER_SESSION_DIRECTORIES.knowledge);
        let entries: string[];
        try {
            entries = await readdir(directory);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
        }
        const files: StoredFile[] = [];
        for (const name of entries) {
            if (name.startsWith(FILE_SERVER_TEMP.prefix)) continue;
            const path = join(directory, name);
            const info = await stat(path);
            if (info.isFile()) files.push({ name, path, size: info.size });
        }
        return files;
    }

    /** Reads a stored knowledge file's contents. */
    async readKnowledgeFile(location: SessionLocation, fileName: string): Promise<Buffer> {
        this.assertSafeFileName(fileName);
        const path = join(this.sessionDirectory(location), FILE_SERVER_SESSION_DIRECTORIES.knowledge, fileName);
        try {
            return await readFile(path);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AppError(404, FILE_SERVER_ERRORS.notFound);
            throw new AppError(500, FILE_SERVER_ERRORS.unreadable);
        }
    }

    /** Removes a session's entire directory tree. Used during full session cleanup. */
    async deleteSession(location: SessionLocation): Promise<void> {
        await rm(this.sessionDirectory(location), { recursive: true, force: true });
        logger.info({ workspaceId: location.workspaceId, sessionId: location.sessionId }, "Deleted session file tree");
    }

    private sessionDirectory(location: SessionLocation): string {
        const segments = [location.workspaceId, location.scope, location.sessionId].map(segment => this.assertSafeId(segment));
        const directory = resolve(join(this.base, ...segments));
        // Defence in depth: the resolved directory must stay within the base even though segments are validated.
        if (directory !== this.base && !directory.startsWith(this.base + (process.platform === DESKTOP_PLATFORM.windows ? "\\" : "/"))) {
            throw new AppError(400, FILE_SERVER_ERRORS.invalidId);
        }
        return directory;
    }

    private async makeHardenedDirectory(directory: string): Promise<void> {
        await mkdir(directory, { recursive: true, mode: FILE_SERVER_FILE_MODES.directory });
        if (process.platform !== DESKTOP_PLATFORM.windows) await chmod(directory, FILE_SERVER_FILE_MODES.directory);
    }

    private assertSafeId(value: string): string {
        if (!FILE_SERVER_ID_PATTERN.test(value)) throw new AppError(400, FILE_SERVER_ERRORS.invalidId);
        return value;
    }

    private assertSafeFileName(fileName: string): void {
        if (fileName.length === 0 || fileName.length > 255 || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..") || fileName.startsWith(".")) {
            throw new AppError(400, FILE_SERVER_ERRORS.invalidFileName);
        }
    }

    private assertAllowedType(fileName: string, mimeType: string): void {
        const extension = extname(fileName).toLowerCase();
        if (FILE_SERVER_BLOCKED_EXTENSIONS.has(extension)) throw new AppError(415, FILE_SERVER_ERRORS.blockedType);
        if (FILE_SERVER_BLOCKED_MIME_TYPES.has(mimeType.toLowerCase().split(";")[0].trim())) throw new AppError(415, FILE_SERVER_ERRORS.blockedType);
    }
}
