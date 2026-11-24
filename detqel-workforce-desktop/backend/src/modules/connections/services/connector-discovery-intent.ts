import { AppError } from "../../../shared/errors/app-error.js";

export interface ConnectionDiscoveryIntent {
    readonly resourceScope: "single-repository" | "provider";
    readonly provider: "github" | null;
    readonly requestedTransport: "mcp" | null;
}

/** Retain explicit resource boundaries before web retrieval or model interpretation can broaden them. */
export function connectionDiscoveryIntent(query: string): ConnectionDiscoveryIntent {
    const github = /\bgit[\s-]*hub\b|\bgithub\.com\b/i.test(query);
    const repository = /\b(?:repos?|repository|repositories|codebase|source[\s-]*code)\b/i.test(query);
    const mcp = /\bmcp\b|\bmodel context protocol\b/i.test(query);
    const broaderScope = /\b(?:account|organization|organisation|enterprise)[\s-]*(?:wide|level)\b|\b(?:all|multiple) (?:repos|repositories)\b/i.test(query);
    const accountRequest = !repository && /\b(?:account|organization|organisation)\b/i.test(query);
    return {
        resourceScope: !broaderScope && (repository || github && !mcp && !accountRequest) ? "single-repository" : "provider",
        provider: github ? "github" : null,
        requestedTransport: mcp ? "mcp" : null,
    };
}

export function connectionDiscoverySearch(query: string, intent: ConnectionDiscoveryIntent): string {
    if (intent.resourceScope === "single-repository") {
        return `${query} official ${intent.requestedTransport === "mcp" ? "MCP single repository access restriction" : "REST API single repository owner repo contents"} fine-grained token read-only permissions configuration documentation`;
    }
    return `${query} official ${intent.requestedTransport === "mcp" ? "MCP transport" : "integration API"} resource-scoped connectivity authentication configuration documentation`;
}

/** Model output is a proposal. Requested scope and transport remain backend-enforced constraints. */
export function assertDiscoveryIntent(intent: ConnectionDiscoveryIntent, protocol: string): void {
    if (intent.resourceScope === "single-repository" && protocol !== "github-repository") {
        throw new AppError(422, "This search requests a single repository, but discovery proposed a broader connection. No connection was created. A repository-scoped adapter is required.");
    }
    if (intent.requestedTransport === "mcp" && !protocol.startsWith("mcp-")) {
        throw new AppError(422, "Discovery did not satisfy the requested MCP transport. No connection was created.");
    }
}
