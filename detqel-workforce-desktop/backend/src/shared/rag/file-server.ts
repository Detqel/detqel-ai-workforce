import { createHash, randomBytes } from "node:crypto";
import { DOCUMENT_ASSET_PATTERN, DOCUMENT_IMAGE_ERRORS, DOCUMENT_RENDER_LIMITS } from "../../constants/documentImageConstants.js";
import { homedir } from "node:os";
import { chmod, mkdir, readFile, readdir, rename, rm, unlink, writeFile, stat, realpath, lstat, open, link } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
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
    /** Set when listing a folder. */
    readonly modifiedAt?: Date;
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
        const stored = await this.store(location, FILE_SERVER_SESSION_DIRECTORIES.knowledge, fileName, mimeType, contents);
        logger.info({ workspaceId: location.workspaceId, sessionId: location.sessionId, fileName }, "Stored session knowledge file");
        return stored;
    }

    /** Lists the knowledge files stored for a session. */
    listKnowledgeFiles(location: SessionLocation): Promise<StoredFile[]> {
        return this.list(location, FILE_SERVER_SESSION_DIRECTORIES.knowledge);
    }

    /** Reads a stored knowledge file's contents. */
    readKnowledgeFile(location: SessionLocation, fileName: string): Promise<Buffer> {
        return this.read(location, FILE_SERVER_SESSION_DIRECTORIES.knowledge, fileName);
    }

    /** Removes one knowledge file. Returns false when there was none. */
    deleteKnowledgeFile(location: SessionLocation, fileName: string): Promise<boolean> {
        return this.remove(location, FILE_SERVER_SESSION_DIRECTORIES.knowledge, fileName);
    }

    /**
     * Stores a file in a session's artifacts, replacing one with the same name. The same type rules as uploads
     * apply. The write is atomic.
     */
    async storeArtifact(location: SessionLocation, fileName: string, mimeType: string, contents: Buffer): Promise<StoredFile> {
        const stored = await this.store(location, FILE_SERVER_SESSION_DIRECTORIES.artifacts, fileName, mimeType, contents);
        logger.info({ workspaceId: location.workspaceId, sessionId: location.sessionId, fileName }, "Stored session artifact");
        return stored;
    }

    /** Publishes a complete new artifact atomically without overwriting a concurrently uploaded file. */
    async storeArtifactIfAbsent(location: SessionLocation, fileName: string, mimeType: string, contents: Buffer): Promise<StoredFile | null> {
        this.assertSafeFileName(fileName);
        this.assertAllowedType(fileName, mimeType);
        const directory = join(this.sessionDirectory(location), FILE_SERVER_SESSION_DIRECTORIES.artifacts);
        await this.makeHardenedDirectory(directory);
        const target = join(directory, fileName);
        const temporary = join(directory, `${FILE_SERVER_TEMP.prefix}${randomBytes(FILE_SERVER_TEMP.randomBytes).toString(FILE_SERVER_TEMP.encoding)}${FILE_SERVER_TEMP.suffix}`);
        const temporaryFile = await open(temporary, "wx", FILE_SERVER_FILE_MODES.file);
        try {
            await temporaryFile.writeFile(contents);
            await temporaryFile.close();
            if (process.platform !== DESKTOP_PLATFORM.windows) await chmod(temporary, FILE_SERVER_FILE_MODES.file);
            try { await link(temporary, target); }
            catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return null; throw error; }
            return { name: fileName, path: target, size: contents.byteLength };
        } finally { await temporaryFile.close().catch(() => undefined); await unlink(temporary).catch(() => undefined); }
    }

    listArtifacts(location: SessionLocation): Promise<StoredFile[]> {
        return this.list(location, FILE_SERVER_SESSION_DIRECTORIES.artifacts);
    }

    readArtifact(location: SessionLocation, fileName: string): Promise<Buffer> {
        return this.read(location, FILE_SERVER_SESSION_DIRECTORIES.artifacts, fileName);
    }

    /** Content-addressed assets stay out of the list of handed-over documents. */
    async storeDocumentAsset(location: SessionLocation, contents: Buffer): Promise<string> {
        if (!contents.length || contents.length > DOCUMENT_RENDER_LIMITS.imageBytes) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidImage);
        const name = createHash("sha256").update(contents).digest("hex") + ".png";
        await this.store(location, FILE_SERVER_SESSION_DIRECTORIES.documentAssets, name, "image/png", contents);
        return "kin-asset:" + name;
    }

    async readDocumentAsset(location: SessionLocation, source: string): Promise<Buffer> {
        const match = DOCUMENT_ASSET_PATTERN.exec(source);
        if (!match) throw new AppError(400, DOCUMENT_IMAGE_ERRORS.unavailableAsset);
        const target = join(this.sessionDirectory(location), FILE_SERVER_SESSION_DIRECTORIES.documentAssets, match[1]);
        try {
            const base = await realpath(this.base);
            const physical = await realpath(target);
            const expected = join(base, location.workspaceId, location.scope, location.sessionId, FILE_SERVER_SESSION_DIRECTORIES.documentAssets, match[1]);
            const equal = process.platform === "win32" ? physical.toLowerCase() === expected.toLowerCase() : physical === expected;
            if (!equal || (await lstat(target)).isSymbolicLink()) throw new Error("Invalid asset location");
            const handle = await open(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
            const chunks: Buffer[] = [];
            let length = 0;
            try {
                const info = await handle.stat();
                if (!info.isFile() || info.size > DOCUMENT_RENDER_LIMITS.imageBytes) throw new Error("Asset size limit");
                for await (const chunk of handle.createReadStream({ autoClose: false, start: 0, end: DOCUMENT_RENDER_LIMITS.imageBytes })) {
                    length += (chunk as Buffer).length;
                    if (length > DOCUMENT_RENDER_LIMITS.imageBytes) throw new Error("Asset size limit");
                    chunks.push(chunk as Buffer);
                }
            } finally { await handle.close(); }
            const contents = Buffer.concat(chunks);
            if (contents.length > DOCUMENT_RENDER_LIMITS.imageBytes || createHash("sha256").update(contents).digest("hex") + ".png" !== match[1]) throw new Error("Asset integrity mismatch");
            return contents;
        } catch { throw new AppError(404, DOCUMENT_IMAGE_ERRORS.unavailableAsset); }
    }

    /** Removes one artifact. Returns false when it did not exist. */
    deleteArtifact(location: SessionLocation, fileName: string): Promise<boolean> {
        return this.remove(location, FILE_SERVER_SESSION_DIRECTORIES.artifacts, fileName);
    }

    private async remove(location: SessionLocation, folder: string, fileName: string): Promise<boolean> {
        this.assertSafeFileName(fileName);
        try {
            await unlink(join(this.sessionDirectory(location), folder, fileName));
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
            throw error;
        }
    }

    /** True when the session's artifacts already hold a file with this name. */
    async hasArtifact(location: SessionLocation, fileName: string): Promise<boolean> {
        this.assertSafeFileName(fileName);
        try {
            return (await stat(join(this.sessionDirectory(location), FILE_SERVER_SESSION_DIRECTORIES.artifacts, fileName))).isFile();
        } catch {
            return false;
        }
    }

    private async store(location: SessionLocation, folder: string, fileName: string, mimeType: string, contents: Buffer): Promise<StoredFile> {
        this.assertSafeFileName(fileName);
        this.assertAllowedType(fileName, mimeType);
        const directory = join(this.sessionDirectory(location), folder);
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
        return { name: fileName, path: target, size: contents.byteLength };
    }

    private async list(location: SessionLocation, folder: string): Promise<StoredFile[]> {
        const directory = join(this.sessionDirectory(location), folder);
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
            if (info.isFile()) files.push({ name, path, size: info.size, modifiedAt: info.mtime });
        }
        return files;
    }

    private async read(location: SessionLocation, folder: string, fileName: string): Promise<Buffer> {
        this.assertSafeFileName(fileName);
        const path = join(this.sessionDirectory(location), folder, fileName);
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
