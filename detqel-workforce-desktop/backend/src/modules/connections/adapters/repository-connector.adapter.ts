import type { ConnectorAdapter, ConnectorContext, ConnectorHandle, ConnectorRuntimeOptions } from "../../../shared/types/connector-catalog.js";
import { repositoryOperations } from "../operations/repository-operations.js";
import type { RepositoryProvider } from "./repository-providers.js";

/**
 * Verifies a repository connection by reading the repository itself, which proves the server URL, the
 * repository name and the token's access together. The verified handle then serves read-only operations.
 */
export class RepositoryConnectorAdapter implements ConnectorAdapter {
    readonly key: string;

    constructor(private readonly provider: RepositoryProvider, private readonly options: ConnectorRuntimeOptions) {
        this.key = provider.key;
    }

    async connect(configuration: Record<string, unknown>, _context: ConnectorContext): Promise<ConnectorHandle> {
        const client = this.provider.create(configuration, this.options.requestTimeoutMs);
        const repository = await client.repository();
        return {
            metadata: {
                verification: "repository-access",
                provider: this.provider.name,
                repository: repository.fullName,
                defaultBranch: repository.defaultBranch,
                visibility: repository.visibility,
                webUrl: repository.webUrl,
            },
            execute: repositoryOperations(client, repository.defaultBranch),
            close: async () => {},
        };
    }
}
