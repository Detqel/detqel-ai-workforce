import { AppError } from "../../../shared/errors/app-error.js";
import type { ConnectorAdapter, ConnectorContext, ConnectorHandle, ConnectorRuntimeOptions } from "../../../shared/types/connector-catalog.js";
import { allowedExecutable, allowedFilesystemPath, authenticationHeaders, httpEndpoint, requiredString } from "./adapter-configuration.js";
import { HttpConnectorAdapter } from "./data-connector.adapters.js";
import { verifiedHttpResponse } from "./http-verification.js";

export class LocalEnvironmentConnectorAdapter implements ConnectorAdapter {
    readonly key = "environment.local";
    constructor(private readonly options: ConnectorRuntimeOptions) {}

    async connect(configuration: Record<string, unknown>, _context: ConnectorContext): Promise<ConnectorHandle> {
        await allowedExecutable(requiredString(configuration, "runtime"), this.options.allowedCommandPaths);
        await allowedFilesystemPath(requiredString(configuration, "workingDirectory"), this.options.allowedFilesystemRoots, "directory");
        return { metadata: { verification: "local-runtime-availability", runtimeAvailable: true, directoryReadable: true }, close: async () => {} };
    }
}

export class HttpEnvironmentConnectorAdapter implements ConnectorAdapter {
    readonly key = "environment.http";
    private readonly adapter: HttpConnectorAdapter;
    constructor(options: ConnectorRuntimeOptions) { this.adapter = new HttpConnectorAdapter(options); }

    connect(configuration: Record<string, unknown>, context: ConnectorContext): Promise<ConnectorHandle> {
        return this.adapter.connect(configuration, context);
    }
}

export class DockerEnvironmentConnectorAdapter implements ConnectorAdapter {
    readonly key = "environment.docker";
    constructor(private readonly options: ConnectorRuntimeOptions) {}

    async connect(configuration: Record<string, unknown>, _context: ConnectorContext): Promise<ConnectorHandle> {
        const endpoint = httpEndpoint(requiredString(configuration, "endpoint"));
        const versionEndpoint = new URL(endpoint);
        const infoEndpoint = new URL(endpoint);
        const basePath = endpoint.pathname.endsWith("/") ? endpoint.pathname : `${endpoint.pathname}/`;
        versionEndpoint.pathname = `${basePath}version`;
        infoEndpoint.pathname = `${basePath}info`;
        const headers = authenticationHeaders(configuration);
        const version = await verifiedHttpResponse(versionEndpoint, headers, this.options.requestTimeoutMs, true);
        const info = await verifiedHttpResponse(infoEndpoint, headers, this.options.requestTimeoutMs, true);
        if (version === null || typeof version !== "object" || typeof (version as Record<string, unknown>).ApiVersion !== "string"
            || typeof (version as Record<string, unknown>).Version !== "string" || info === null || typeof info !== "object" || typeof (info as Record<string, unknown>).ID !== "string") {
            throw new AppError(422, "The endpoint did not return valid Docker daemon verification responses.");
        }
        return { metadata: { verification: "docker-daemon", origin: endpoint.origin }, close: async () => {} };
    }
}
