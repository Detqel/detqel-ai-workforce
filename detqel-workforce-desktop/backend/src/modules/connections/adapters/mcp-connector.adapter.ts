import { MCP_CLIENT_IDENTITY } from "../../../constants/connectionConstants.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConnectorAdapter, ConnectorContext, ConnectorHandle, ConnectorRuntimeOptions } from "../../../shared/types/connector-catalog.js";
import { allowedExecutable, authenticationHeaders, bounded, httpEndpoint, requiredString } from "./adapter-configuration.js";
import { originRestrictedFetch } from "./http-verification.js";

export type McpTransportFactory = (configuration: Record<string, unknown>, options: ConnectorRuntimeOptions) => Promise<Transport>;

export const createStdioTransport: McpTransportFactory = async (configuration, options) => {
    const command = await allowedExecutable(requiredString(configuration, "command"), options.allowedCommandPaths);
    const args = configuration.arguments;
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) throw new AppError(400, "STDIO arguments must be an array of strings.");
    const environment = configuration.environment;
    if (environment === null || typeof environment !== "object" || Array.isArray(environment)
        || Object.entries(environment).some(([name, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || typeof value !== "string" || value.includes("\0"))) {
        throw new AppError(400, "STDIO environment must be an object containing valid environment variable names and string values.");
    }
    if ((args as string[]).some((arg) => arg.includes("\0"))) throw new AppError(400, "STDIO arguments cannot contain null characters.");
    return new StdioClientTransport({ command, args: args as string[], env: environment as Record<string, string>, stderr: "ignore" });
};

export const createStreamableHttpTransport: McpTransportFactory = async (configuration, options) => {
    const endpoint = httpEndpoint(requiredString(configuration, "endpoint"));
    const headers = authenticationHeaders(configuration);
    return new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers, redirect: "error" },
        fetch: originRestrictedFetch(endpoint, headers, options.requestTimeoutMs),
        redirectPolicy: "same-origin",
        reconnectionOptions: {
            maxRetries: 0,
            initialReconnectionDelay: options.requestTimeoutMs,
            maxReconnectionDelay: options.requestTimeoutMs,
            reconnectionDelayGrowFactor: 1,
        },
    });
};

export const createSseTransport: McpTransportFactory = async (configuration, options) => {
    const endpoint = httpEndpoint(requiredString(configuration, "endpoint"));
    const headers = authenticationHeaders(configuration);
    return new SSEClientTransport(endpoint, {
        requestInit: { headers, redirect: "error" },
        fetch: originRestrictedFetch(endpoint, headers, options.requestTimeoutMs),
        redirectPolicy: "same-origin",
    });
};

/** Protocol behavior is owned by the official SDK; transport factories are independently registered. */
export class McpConnectorAdapter implements ConnectorAdapter {
    constructor(readonly key: string, private readonly factory: McpTransportFactory, private readonly options: ConnectorRuntimeOptions) {}

    async connect(configuration: Record<string, unknown>, context: ConnectorContext): Promise<ConnectorHandle> {
        requiredString(configuration, "serverName");
        const transport = await this.factory(configuration, this.options);
        const client = new Client(MCP_CLIENT_IDENTITY, { capabilities: {} });
        let connected = false;
        let closing = false;
        let disconnected = false;
        let closeOperation: Promise<void> | undefined;
        const notifyDisconnect = () => {
            if (closing || disconnected) return;
            disconnected = true;
            if (connected) context.onDisconnect?.();
        };
        const close = (): Promise<void> => {
            if (closeOperation !== undefined) return closeOperation;
            closing = true;
            closeOperation = (async () => {
                try {
                    try {
                        if (connected && transport instanceof StreamableHTTPClientTransport) {
                            await bounded(transport.terminateSession(), this.options.requestTimeoutMs);
                        }
                    } finally {
                        await bounded(client.close(), this.options.requestTimeoutMs);
                    }
                } catch {
                    throw new AppError(422, "MCP session shutdown could not be fully confirmed.");
                }
            })();
            return closeOperation;
        };
        client.onclose = notifyDisconnect;
        client.onerror = () => {
            notifyDisconnect();
            if (connected && !closing) void close().catch(() => {});
        };
        const requestOptions = {
            timeout: this.options.requestTimeoutMs,
            maxTotalTimeout: this.options.requestTimeoutMs,
            resetTimeoutOnProgress: false,
        };
        try {
            await bounded(client.connect(transport, requestOptions), this.options.requestTimeoutMs, () => { void close().catch(() => {}); });
            const capabilities = client.getServerCapabilities();
            if (capabilities === undefined) throw new AppError(422, "The MCP server did not complete capability negotiation.");
            const discovery: Record<string, unknown> = {
                verification: "mcp-initialize-and-capabilities",
                transport: this.key,
                capabilities: Object.keys(capabilities),
            };
            if (capabilities.tools) {
                const tools = await client.listTools(undefined, requestOptions);
                discovery.tools = tools.tools.map((tool) => tool.name);
                discovery.hasAdditionalTools = tools.nextCursor !== undefined;
            }
            if (capabilities.resources) {
                const resources = await client.listResources(undefined, requestOptions);
                discovery.resourceCount = resources.resources.length;
                discovery.hasAdditionalResources = resources.nextCursor !== undefined;
            }
            if (capabilities.prompts) {
                const prompts = await client.listPrompts(undefined, requestOptions);
                discovery.prompts = prompts.prompts.map((prompt) => prompt.name);
                discovery.hasAdditionalPrompts = prompts.nextCursor !== undefined;
            }
            if (closing || disconnected) throw new AppError(422, "The MCP server disconnected during verification.");
            connected = true;
            return { metadata: discovery, close };
        } catch (error) {
            await close().catch(() => {});
            throw error;
        }
    }
}
