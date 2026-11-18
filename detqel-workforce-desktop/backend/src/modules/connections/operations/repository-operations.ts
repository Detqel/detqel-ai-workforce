import { REPOSITORY_LIMITS, REPOSITORY_RESOURCES } from "../../../constants/connectionConstants.js";
import { CONNECTOR_OPERATIONS } from "../../../constants/connectorOperationConstants.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConnectorOperationRequest, ConnectorOperationResult } from "../../../shared/types/connector-catalog.js";
import type { RepositoryClient } from "../adapters/repository-providers.js";

const INVALID_REF = /[\s~^:?*[\\\u0000-\u001f\u007f]/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** A path relative to the repository root. `..` is refused so a request cannot step outside the repository. */
export function repositoryPath(value: unknown, allowRoot: boolean): string {
    if (value === undefined || value === null || value === "") {
        if (allowRoot) return "";
        throw new AppError(400, "A file path is required.");
    }
    if (typeof value !== "string" || value.length > REPOSITORY_LIMITS.maxPathLength) throw new AppError(400, "The path must be text of a reasonable length.");
    const segments = value.replace(/\\/g, "/").split("/").filter(segment => segment !== "" && segment !== ".");
    if (segments.some(segment => segment === ".." || CONTROL_CHARACTERS.test(segment))) throw new AppError(400, "The path must stay inside the repository.");
    if (!segments.length && !allowRoot) throw new AppError(400, "A file path is required.");
    return segments.join("/");
}

/** A branch, tag or commit; the repository's default branch when none is given. */
export function repositoryRef(value: unknown, defaultBranch: string | null): string {
    const ref = value === undefined || value === null || value === "" ? defaultBranch : value;
    if (ref === null) throw new AppError(409, "This repository has no default branch yet. Pass a ref to choose a branch, tag or commit.");
    if (typeof ref !== "string" || !ref.length || ref.length > REPOSITORY_LIMITS.maxRefLength
        || INVALID_REF.test(ref) || ref.includes("..") || ref.startsWith("/") || ref.endsWith("/")) {
        throw new AppError(400, "The ref is not a valid branch, tag or commit name.");
    }
    return ref;
}

function pageSize(value: unknown): number {
    if (value === undefined || value === null) return REPOSITORY_LIMITS.defaultPageSize;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > REPOSITORY_LIMITS.maxPageSize) {
        throw new AppError(400, `The limit must be a whole number from 1 to ${REPOSITORY_LIMITS.maxPageSize}.`);
    }
    return value;
}

/**
 * Builds execute() for a repository connection. Repository connections are read-only:
 * - list { resource: "branches" | "commits" | "pull-requests", limit?, ref? }
 * - list { resource: "files", path?, ref? } lists one directory level
 * - read / fetch { path, ref? } returns a text file
 * `ref` defaults to the repository's default branch.
 */
export function repositoryOperations(client: RepositoryClient, defaultBranch: string | null): (request: ConnectorOperationRequest) => Promise<ConnectorOperationResult> {
    return async request => {
        const parameters = request.parameters as Record<string, unknown>;
        if (request.operation === CONNECTOR_OPERATIONS.list) {
            const resource = parameters.resource;
            if (resource === REPOSITORY_RESOURCES.branches) {
                const items = await client.branches(pageSize(parameters.limit));
                return { data: items, metadata: { resource, count: items.length } };
            }
            if (resource === REPOSITORY_RESOURCES.files) {
                const path = repositoryPath(parameters.path, true);
                const ref = repositoryRef(parameters.ref, defaultBranch);
                const page = parameters.page === undefined ? 1 : parameters.page;
                if (typeof page !== "number" || !Number.isSafeInteger(page) || page < 1 || page > 1_000_000) throw new AppError(400, "The directory page is invalid.");
                const items = await client.entries(path, ref, page);
                return { data: items, metadata: { resource, path, ref, page, count: items.length, nextPage: items.nextPage ?? null, listingComplete: items.complete === true } };
            }
            if (resource === REPOSITORY_RESOURCES.commits) {
                const ref = repositoryRef(parameters.ref, defaultBranch);
                const items = await client.commits(ref, pageSize(parameters.limit));
                return { data: items, metadata: { resource, ref, count: items.length } };
            }
            if (resource === REPOSITORY_RESOURCES.pullRequests) {
                const items = await client.pullRequests(pageSize(parameters.limit));
                return { data: items, metadata: { resource, count: items.length } };
            }
            throw new AppError(400, `Choose a resource to list: ${Object.values(REPOSITORY_RESOURCES).join(", ")}.`);
        }
        if (request.operation === CONNECTOR_OPERATIONS.read || request.operation === CONNECTOR_OPERATIONS.fetch) {
            const path = repositoryPath(parameters.path, false);
            const ref = repositoryRef(parameters.ref, defaultBranch);
            const content = await client.file(path, ref);
            const offset = parameters.offset === undefined ? 0 : parameters.offset;
            const length = parameters.length === undefined ? 8_000 : parameters.length;
            if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0 || offset > content.length) throw new AppError(400, "The file offset is invalid.");
            if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 1 || length > 8_000) throw new AppError(400, "Read between 1 and 8000 characters per file page.");
            const end = Math.min(offset + length, content.length);
            const startLine = content.slice(0, offset).split("\n").length;
            return { data: { path, ref, content: content.slice(offset, end), offset, nextOffset: end < content.length ? end : null, totalCharacters: content.length, startLine },
                metadata: { path, ref, offset, end, totalCharacters: content.length, startLine, nextOffset: end < content.length ? end : null } };
        }
        throw new AppError(422, "Repository connections are read-only. They support the list, read and fetch operations.");
    };
}
