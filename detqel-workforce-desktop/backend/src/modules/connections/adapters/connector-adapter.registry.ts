import { CONNECTOR_ADAPTER_KEYS } from "../../../constants/connectionConstants.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConnectorAdapter, ConnectorContext, ConnectorHandle, ConnectorRuntimeOptions } from "../../../shared/types/connector-catalog.js";
import { FilesystemConnectorAdapter, GithubConnectorAdapter, HttpConnectorAdapter, PostgresConnectorAdapter } from "./data-connector.adapters.js";
import { DockerEnvironmentConnectorAdapter, HttpEnvironmentConnectorAdapter, LocalEnvironmentConnectorAdapter } from "./environment-connector.adapters.js";
import { createSseTransport, createStdioTransport, createStreamableHttpTransport, McpConnectorAdapter } from "./mcp-connector.adapter.js";

export class ConnectorAdapterRegistry {
    private readonly adapters = new Map<string, ConnectorAdapter>();

    constructor(options: ConnectorRuntimeOptions) {
        if (!Number.isSafeInteger(options.requestTimeoutMs) || options.requestTimeoutMs <= 0) {
            throw new AppError(503, "A positive connector request timeout must be configured.");
        }
        [
            new PostgresConnectorAdapter(options),
            new HttpConnectorAdapter(options),
            new FilesystemConnectorAdapter("file", options),
            new FilesystemConnectorAdapter("directory", options),
            new GithubConnectorAdapter(options),
            new McpConnectorAdapter(CONNECTOR_ADAPTER_KEYS.mcpStdio, createStdioTransport, options),
            new McpConnectorAdapter(CONNECTOR_ADAPTER_KEYS.mcpStreamableHttp, createStreamableHttpTransport, options),
            new McpConnectorAdapter(CONNECTOR_ADAPTER_KEYS.mcpSse, createSseTransport, options),
            new LocalEnvironmentConnectorAdapter(options),
            new HttpEnvironmentConnectorAdapter(options),
            new DockerEnvironmentConnectorAdapter(options),
        ].forEach((adapter) => this.register(adapter));
    }

    register(adapter: ConnectorAdapter): void {
        if (this.adapters.has(adapter.key)) throw new AppError(500, "A connector adapter key is already registered.");
        this.adapters.set(adapter.key, adapter);
    }

    supports(adapterKey: string): boolean { return this.adapters.has(adapterKey); }

    async connect(adapterKey: string, configuration: Record<string, unknown>, context: ConnectorContext): Promise<ConnectorHandle> {
        const adapter = this.adapters.get(adapterKey);
        if (adapter === undefined) throw new AppError(422, "The selected connector does not have an implemented adapter.");
        try { return await adapter.connect(configuration, context); }
        catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(422, "Connection verification failed. Check the configuration, credentials, endpoint availability, and operator permissions.");
        }
    }
}
