import { lstat, mkdir, open, readdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { AppError } from "../errors/app-error.js";
import type { SessionLocation } from "./file-server.js";

export type SessionNames = (location: SessionLocation) => Promise<{ workspace: string; session: string }>;
const OWNER = ".kin-owner.json";

export function storageFolderName(value: string): string {
    const clean = value.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().replace(/^[. ]+|[. ]+$/g, "").slice(0, 72).replace(/[. ]+$/g, "");
    if (!clean) throw new AppError(422, "Choose a workspace or chat name containing letters or numbers for its storage folder.");
    return /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(clean) ? `_${clean}` : clean;
}


/** Folder labels are display names. Ownership is bound to immutable IDs in hidden metadata. */
export class NamedDirectories {
    private tail: Promise<unknown> = Promise.resolve();
    private readonly locations = new Map<string, { workspace: string; session: string; path: string }>();
    constructor(private readonly base: string, private readonly names: SessionNames) {}

    directory(location: SessionLocation): Promise<string> {
        const work = this.tail.then(() => this.resolveDirectory(location));
        this.tail = work.catch(() => undefined);
        return work;
    }

    private async safeDirectory(path: string): Promise<boolean> {
        const inside = relative(this.base, resolve(path));
        if (isAbsolute(inside) || inside === ".." || inside.startsWith("..\\") || inside.startsWith("../")) throw new AppError(400, "The storage path leaves the configured file store.");
        try {
            const info = await lstat(path);
            const physical = await realpath(path);
            const expected = resolve(path);
            if (!info.isDirectory() || info.isSymbolicLink() || (process.platform === "win32" ? physical.toLowerCase() !== expected.toLowerCase() : physical !== expected)) throw new AppError(422, "The chat storage folder must be a regular directory, without links.");
            return true;
        } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
    }

    private async owned(path: string, id: string): Promise<boolean> {
        if (!await this.safeDirectory(path)) return false;
        try {
            const marker = join(path, OWNER);
            const info = await lstat(marker);
            if (!info.isFile() || info.isSymbolicLink() || info.size > 1024) throw new AppError(422, "Invalid chat storage ownership metadata.");
            const owner: unknown = JSON.parse(await readFile(marker, "utf8"));
            return Boolean(owner && typeof owner === "object" && "id" in owner && owner.id === id);
        } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
    }

    private async allocate(parent: string, label: string, id: string, legacy: string[]): Promise<string> {
        const name = storageFolderName(label);
        let source: string | undefined;
        for (const entry of await readdir(parent, { withFileTypes: true })) {
            if (entry.isDirectory() && await this.owned(join(parent, entry.name), id)) { source = join(parent, entry.name); break; }
        }
        if (!source) for (const path of legacy) {
            if (await this.safeDirectory(path)) {
                const marker = join(path, OWNER);
                try { await writeFile(marker, JSON.stringify({ version: 1, id }), { flag: "wx", mode: 0o600 }); }
                catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !await this.owned(path, id)) throw error; }
                source = path;
                break;
            }
        }
        if (source) {
            const current = basename(source);
            const suffix = current.startsWith(`${name} (`) ? current.slice(name.length) : "";
            // Preserve an already assigned collision suffix across app restarts and sibling deletions.
            if (current === name || /^ \([1-9][0-9]*\)$/.test(suffix)) return source;
        }
        // Human-readable suffixes distinguish chats or workspaces with the same display name.
        for (let number = 1; number <= 10_000; number++) {
            const target = join(parent, number === 1 ? name : `${name} (${number})`);
            if (source && (process.platform === "win32" ? resolve(source).toLowerCase() === resolve(target).toLowerCase() : resolve(source) === resolve(target))) return source;
            if (await this.safeDirectory(target)) continue;
            if (source) {
                await this.safeDirectory(source);
                await rename(source, target);
            } else {
                await mkdir(target, { mode: 0o700 });
                await writeFile(join(target, OWNER), JSON.stringify({ version: 1, id }), { flag: "wx", mode: 0o600 });
            }
            return target;
        }
        throw new AppError(409, "Too many chat storage folders share this name. Choose a more specific name.");
    }

    private async resolveDirectory(location: SessionLocation): Promise<string> {
        const names = await this.names(location);
        const key = `${location.workspaceId}:${location.scope}:${location.sessionId}`;
        const cached = this.locations.get(key);
        if (cached?.workspace === names.workspace && cached.session === names.session && await this.owned(cached.path, location.sessionId)) return cached.path;
        await mkdir(this.base, { recursive: true, mode: 0o700 });
        await this.safeDirectory(this.base);
        const lockPath = join(this.base, ".kin-layout.lock");
        const lock = await this.acquireLock(lockPath);
        try {
            const workspace = await this.allocate(this.base, names.workspace, location.workspaceId, [join(this.base, location.workspaceId)]);
            const scope = join(workspace, location.scope === "conversations" ? "chats" : location.scope);
            if (!await this.safeDirectory(scope)) await mkdir(scope, { mode: 0o700 });
            const legacy = [join(scope, location.sessionId)];
            if (location.scope === "conversations") legacy.push(join(workspace, "conversations", location.sessionId));
            const path = await this.allocate(scope, names.session, location.sessionId, legacy);
            if (this.locations.size >= 5_000) this.locations.clear();
            this.locations.set(key, { ...names, path });
            return path;
        } finally { await lock.close(); await unlink(lockPath); }
    }

    private async acquireLock(path: string) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const handle = await open(path, "wx", 0o600);
                try { await handle.writeFile(JSON.stringify({ pid: process.pid })); }
                catch (error) { await handle.close(); await unlink(path); throw error; }
                return handle;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
                const before = await lstat(path);
                if (!before.isFile() || before.isSymbolicLink() || before.size > 1024) throw new AppError(422, "Invalid chat storage layout lock.");
                let pid: number | undefined;
                try { const value = JSON.parse(await readFile(path, "utf8")); if (Number.isSafeInteger(value.pid) && value.pid > 0) pid = value.pid; } catch { /* A process may have stopped before writing its lock metadata. */ }
                let alive = pid === undefined;
                if (pid !== undefined) try { process.kill(pid, 0); alive = true; } catch (probe) { if ((probe as NodeJS.ErrnoException).code !== "ESRCH") alive = true; }
                if (alive && (pid !== undefined || Date.now() - before.mtimeMs < 30_000)) throw new AppError(409, "Chat storage is being reorganized by another process. Retry when it finishes.");
                const after = await lstat(path);
                if (before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.size !== after.size) continue;
                await unlink(path);
            }
        }
        throw new AppError(409, "Chat storage ownership is changing. Retry this operation.");
    }
}
