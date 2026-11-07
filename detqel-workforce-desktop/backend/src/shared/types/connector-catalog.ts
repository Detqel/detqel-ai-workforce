export interface ConfigurationProperty {
    type: string;
    title: string;
    description?: string;
    format?: string;
    enum?: Array<string | number | boolean>;
    items?: Record<string, unknown>;
    properties?: Record<string, ConfigurationProperty>;
    additionalProperties?: boolean | Record<string, unknown>;
    "x-secret"?: boolean;
    "x-visibleWhen"?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface ConfigurationSchema {
    type: "object";
    properties: Record<string, ConfigurationProperty>;
    required: string[];
    additionalProperties: false;
    [key: string]: unknown;
}

export interface ConnectorCatalogItem {
    id: string;
    code: string;
    name: string;
    connectorType: string;
    category: string;
    description: string | null;
    adapterKey: string;
    configSchema: ConfigurationSchema;
    isEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ConnectorContext {
    workspaceId: string;
    connectionName: string;
    onDisconnect?: () => void;
}

export interface ConnectorHandle {
    metadata: Record<string, unknown>;
    close(): Promise<void>;
    /** Executes an operation against the live connection. Absent on verify-only adapters. */
    execute?(request: ConnectorOperationRequest): Promise<ConnectorOperationResult>;
}

/** A single operation request against a connected handle, as classified in connectorOperationConstants. */
export interface ConnectorOperationRequest {
    readonly operation: string;
    /** Operation-specific parameters, for example { sql, params } for a query or { path, content } for a write. */
    readonly parameters: Readonly<Record<string, unknown>>;
    /** For invoke-tool, the caller's declaration of whether the tool mutates state. */
    readonly declaredMutating?: boolean;
}

export interface ConnectorOperationResult {
    readonly data: unknown;
    readonly metadata?: Record<string, unknown>;
}

export interface ConnectorAdapter {
    readonly key: string;
    connect(configuration: Record<string, unknown>, context: ConnectorContext): Promise<ConnectorHandle>;
}

export interface ConnectorRuntimeOptions {
    requestTimeoutMs: number;
    allowedCommandPaths: string[];
    allowedFilesystemRoots: string[];
}
