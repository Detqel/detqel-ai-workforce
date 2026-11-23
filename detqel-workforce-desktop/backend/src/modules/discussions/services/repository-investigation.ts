import { z } from "zod";
import { AGENT_CONNECTOR_KINDS, AGENT_TOOL_LIMITS } from "../../../constants/agentContextConstants.js";
import { isProtectedFile, untrusted } from "../../../shared/agents/context/data-guard.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { RepositorySnapshot } from "../../../shared/agents/graphs/task-plan.js";
import { repositoryCompletionIssues, type RepositoryCompletionEvidence } from "../../../shared/agents/graphs/turn-checkpoint.js";
import type { AgentConnector, IAgentConnectorAccess } from "../../connections/services/agent-connector-access.service.js";

const excludedDirectories = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".next", "coverage", ".venv", "venv", "__pycache__"]);
const binary = /\.(png|jpe?g|gif|webp|ico|pdf|docx?|xlsx?|pptx?|zip|gz|7z|jar|exe|dll|so|dylib|woff2?|ttf|mp[34]|wav|sqlite|db|bin|lock)$/i;
const generated = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock)$/;
const entriesSchema = z.array(z.object({ name: z.string(), path: z.string().max(1024), type: z.enum(["file", "directory", "other"]) }));
interface FileRead { total: number; ranges: Array<[number, number]> }
interface Inventory {
    connector: AgentConnector; requestedRef?: string; ref: string;
    queue: Array<{ path: string; page: number }>; directories: Set<string>; pages: Set<string>;
    files: Set<string>; excluded: number; errors: Set<string>; limited: boolean;
    reads: Map<string, FileRead>;
}

/** Turn-scoped, commit-pinned inventory and observed source coverage. No model-generated coverage counts. */
export class RepositoryInvestigation {
    private readonly inventories = new Map<string, Inventory>();
    constructor(private readonly workspaceId: string, private readonly access: IAgentConnectorAccess, private readonly scanPages: number = AGENT_TOOL_LIMITS.repositoryPagesPerScan, private readonly savedSnapshots: ReadonlyArray<RepositorySnapshot> = []) {}

    private key(connector: AgentConnector, ref?: string) { return JSON.stringify([connector.alias, ref ?? null]); }

    pinnedRef(connector: AgentConnector, requestedRef?: string): string | undefined {
        return this.inventories.get(this.key(connector, requestedRef))?.ref ?? requestedRef;
    }

    async scan(connector: AgentConnector, requestedRef: string | undefined, offset: number, signal?: AbortSignal) {
        const key = this.key(connector, requestedRef);
        let inventory = this.inventories.get(key);
        if (!inventory) {
            const snapshot = this.savedSnapshots.find(item => item.connectionId === connector.connectionId && item.requestedRef === requestedRef);
            const described = await this.access.describe(this.workspaceId, connector);
            const branch = snapshot?.commit ?? requestedRef ?? (described.data as { defaultBranch?: string }).defaultBranch;
            if (!branch) throw new AppError(422, "This repository has no default branch. Choose a populated branch before analyzing it.");
            const commits = await this.access.read(this.workspaceId, connector, { kind: AGENT_CONNECTOR_KINDS.repository, operation: "list", parameters: { resource: "commits", ref: branch, limit: 1 } });
            const commit = z.array(z.object({ id: z.string().regex(/^[a-f0-9]{40,64}$/i) })).min(1).parse(commits.data)[0].id;
            inventory = { connector, requestedRef, ref: commit, queue: [{ path: "", page: 1 }], directories: new Set(), pages: new Set(), files: new Set(), excluded: 0, errors: new Set(), limited: false, reads: new Map() };
            this.inventories.set(key, inventory);
        }
        for (let batch = 0; batch < this.scanPages && inventory.queue.length && !inventory.limited; batch++) {
            signal?.throwIfAborted();
            if (inventory.files.size >= AGENT_TOOL_LIMITS.repositoryInventoryEntries || inventory.pages.size >= AGENT_TOOL_LIMITS.repositoryInventoryDirectories) { inventory.limited = true; break; }
            const next = inventory.queue.shift()!;
            const pageKey = JSON.stringify([next.path, next.page]);
            if (inventory.pages.has(pageKey)) { inventory.errors.add(`Repeated directory page: ${next.path || "/"}`); continue; }
            inventory.pages.add(pageKey);
            try {
                const response = await this.access.read(this.workspaceId, connector, { kind: AGENT_CONNECTOR_KINDS.repository, operation: "list", parameters: { resource: "files", path: next.path, page: next.page, ref: inventory.ref } });
                const entries = entriesSchema.parse(response.data);
                let newEntries = 0;
                for (const entry of entries) {
                    if (isProtectedFile(entry.path)) { inventory.excluded++; continue; }
                    if (entry.type === "directory") {
                        if (excludedDirectories.has(entry.name)) { inventory.excluded++; continue; }
                        if (inventory.directories.size >= AGENT_TOOL_LIMITS.repositoryInventoryDirectories) { inventory.limited = true; break; }
                        if (!inventory.directories.has(entry.path)) { inventory.directories.add(entry.path); inventory.queue.push({ path: entry.path, page: 1 }); newEntries++; }
                    } else if (entry.type === "file" && !binary.test(entry.path) && !generated.test(entry.path)) {
                        if (!inventory.files.has(entry.path)) { inventory.files.add(entry.path); newEntries++; }
                    } else inventory.excluded++;
                }
                const more = response.metadata.nextPage;
                if (typeof more === "number" && Number.isSafeInteger(more) && more > next.page) {
                    if (next.page > 1 && !newEntries && entries.length) inventory.errors.add(`Directory pagination repeated entries: ${next.path || "/"}`);
                    else inventory.queue.unshift({ path: next.path, page: more });
                } else if (response.metadata.listingComplete !== true) inventory.errors.add(`Unconfirmed directory completeness: ${next.path || "/"}`);
            } catch (error) {
                signal?.throwIfAborted();
                inventory.errors.add(`Could not inspect ${next.path || "/"}: ${error instanceof AppError ? error.message : "provider response was invalid"}`);
            }
        }
        const allFiles = [...inventory.files].sort();
        const shown: string[] = [];
        let characters = 0;
        for (const path of allFiles.slice(offset, offset + AGENT_TOOL_LIMITS.repositoryInventoryPageSize)) {
            if (characters + path.length > 7_000) break;
            shown.push(path); characters += path.length;
        }
        return { ...this.summary(inventory), paths: shown, manifestOffset: offset, nextManifestOffset: offset + shown.length < allFiles.length ? offset + shown.length : null,
            instruction: inventory.queue.length && !inventory.limited ? "Call scan_repository again to continue inventory discovery. Inventory listing is not a source-code read." : "Read relevant files with read_repository; follow nextOffset until each required file is complete. Request other manifest pages using nextManifestOffset." };
    }

    recordRead(alias: string, metadata: Readonly<Record<string, unknown>>, delivered: boolean): void {
        for (const inventory of this.inventories.values()) {
            if (inventory.connector.alias !== alias || inventory.ref !== metadata.ref || typeof metadata.path !== "string") continue;
            if (!delivered) { inventory.errors.add(`File result exceeded the delivery budget: ${metadata.path}`); continue; }
            const { offset, end, totalCharacters } = metadata;
            if (typeof offset !== "number" || typeof end !== "number" || typeof totalCharacters !== "number") continue;
            const previous = inventory.reads.get(metadata.path);
            const read: FileRead = previous?.total === totalCharacters ? previous : { total: totalCharacters, ranges: [] };
            read.ranges.push([offset, end]);
            read.ranges.sort((left, right) => left[0] - right[0]);
            read.ranges = read.ranges.reduce<Array<[number, number]>>((merged, range) => {
                const last = merged.at(-1);
                if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
                else merged.push([...range]);
                return merged;
            }, []);
            inventory.reads.set(metadata.path, read);
        }
    }

    private summary(inventory: Inventory) {
        const complete = [...inventory.reads].filter(([, read]) => read.ranges.length === 1 && read.ranges[0][0] === 0 && read.ranges[0][1] >= read.total).map(([path]) => path);
        const completeSet = new Set(complete);
        const modules: Record<string, { discovered: number; fullyRead: number }> = {};
        for (const path of inventory.files) {
            const module = path.includes("/") ? path.slice(0, path.indexOf("/")) : "(root)";
            modules[module] ??= { discovered: 0, fullyRead: 0 };
            modules[module].discovered++;
            if (completeSet.has(path)) modules[module].fullyRead++;
        }
        return { connector: inventory.connector.alias, commit: inventory.ref, inventoryComplete: !inventory.queue.length && !inventory.errors.size && !inventory.limited,
            directoriesDiscovered: inventory.directories.size, remainingDirectoryPages: inventory.queue.length, eligibleFilesDiscovered: inventory.files.size,
            fullyReadFiles: complete.length, partiallyReadFiles: inventory.reads.size - complete.length, excludedEntries: inventory.excluded,
            exclusionPolicy: "Credential/key paths, generated/vendor directories, lockfiles, binaries, symlinks and submodules are excluded; test source files remain eligible. No code or tests are executed.",
            limitsReached: inventory.limited, modules, unreadExamples: [...inventory.files].filter(path => !inventory.reads.has(path)).slice(0, 20), errors: [...inventory.errors].slice(0, 15),
            exhaustiveSourceRead: !inventory.queue.length && !inventory.errors.size && !inventory.limited && inventory.files.size === complete.length,
        };
    }

    coverage(): string {
        return untrusted("Observed repository coverage (inventory does not mean source code was read)", JSON.stringify([...this.inventories.values()].map(inventory => this.summary(inventory))));
    }

    snapshots(): ReadonlyArray<RepositorySnapshot> {
        return [...this.inventories.values()].map(inventory => ({ connectionId: inventory.connector.connectionId, requestedRef: inventory.requestedRef, commit: inventory.ref }));
    }

    investigationNeeds(): string[] {
        const needs: string[] = [];
        for (const inventory of this.inventories.values()) {
            if (inventory.queue.length && !inventory.limited) needs.push(`Continue scan_repository for ${inventory.connector.alias}; directory discovery is unfinished.`);
            if (inventory.files.size && !inventory.reads.size) needs.push(`Read actual source files for ${inventory.connector.alias}; listing paths does not establish repository evidence.`);
            const summary = this.summary(inventory);
            const uninspected = Object.entries(summary.modules).filter(([module, values]) => values.fullyRead === 0 && ![...inventory.reads.keys()].some(path => (path.includes("/") ? path.split("/")[0] : "(root)") === module));
            if (uninspected.length) needs.push(`Inspect representative source files in the uninspected top-level areas of ${inventory.connector.alias}: ${uninspected.map(([module]) => module).slice(0, 15).join(", ")}.`);
        }
        return needs;
    }

    completionEvidence(): RepositoryCompletionEvidence {
        const inventories = [...this.inventories.values()];
        return { hasSourceReads: inventories.some(inventory => inventory.reads.size > 0),
            exhaustive: inventories.length > 0 && inventories.every(inventory => this.summary(inventory).exhaustiveSourceRead), report: this.report() };
    }

    completionIssues(content: string): string[] {
        return repositoryCompletionIssues(content, this.completionEvidence());
    }

    report(): string {
        const rows = [...this.inventories.values()].map(inventory => {
            const summary = this.summary(inventory);
            return `- **${inventory.connector.name.replace(/[\r\n*]/g, " ")}** — commit ${inventory.ref}; ${summary.inventoryComplete ? "eligible inventory complete" : "inventory incomplete"}; ${summary.fullyReadFiles} files fully read, ${summary.partiallyReadFiles} partly read, ${summary.eligibleFilesDiscovered} eligible files discovered. ${summary.exhaustiveSourceRead ? "Every discovered eligible file was read." : "Source inspection is partial; this is not an exhaustive code review."}${summary.limitsReached ? " The discovery limit was reached." : ""}${summary.errors.length ? ` ${summary.errors.length} discovery/read gaps were recorded.` : ""}`;
        });
        return rows.length ? `\n\n## Repository inspection record\n\n${rows.join("\n")}\n\nGenerated/vendor directories, lockfiles, binaries, credential files, symlinks and submodules are excluded from source coverage. Repository code and tests were not executed.\n` : "";
    }
}
