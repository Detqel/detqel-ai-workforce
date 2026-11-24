import { compileDiscoveredConfiguration, discoveryOf, type ConnectorDiscoveryMetadata } from "./connector-blueprint.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConnectionDefinition, Connection, NewConnection } from "../../../shared/types/entities.js";
import type { ConfigurationSchema, ConnectorHandle } from "../../../shared/types/connection-adapter.js";
import type { ConnectorAdapterRegistry } from "../adapters/connector-adapter.registry.js";
import type { IConnectionRepository } from "../repositories/connection.repository.js";
import type { IConnectionDefinitionRepository } from "../repositories/connection-definition.repository.js";
import { ConfigurationValidator } from "../validation/configuration.validator.js";
import type { CreateConnectionInput, UpdateConnectionInput } from "../validation/connection.schemas.js";
import { ConnectionCredentialsUnavailableError, type ConnectionCredentialsService } from "./connection-credentials.service.js";
import { connectionAgentAccess } from "./connector-agent-policy.js";

interface ActiveConnection {
    handle: ConnectorHandle;
    workspaceId: string;
}

/** A live connection an agent may read, without its credentials. */
export interface ConnectionReader {
    readonly id: string;
    readonly name: string;
    readonly provider: string;
    readonly adapterKey: string;
    /** Public settings only; secret fields are never included. */
    readonly configuration: Record<string, unknown>;
    readonly metadata: Record<string, unknown>;
    readonly handle: ConnectorHandle;
}

export class ConnectionService {
    private readonly active = new Map<string, ActiveConnection>();
    private readonly reconnecting = new Map<string, Promise<unknown>>();
    private readonly validator = new ConfigurationValidator();

    constructor(
        private readonly repository: IConnectionRepository,
        private readonly definitionRepository: IConnectionDefinitionRepository,
        private readonly credentials: ConnectionCredentialsService,
        private readonly adapters: ConnectorAdapterRegistry,
    ) {}

    private definitionIcon(schema: ConfigurationSchema): string {
        const iconKey = schema["x-icon"];
        if (typeof iconKey !== "string" || !iconKey.trim()) throw new AppError(500, "Connection definition icon metadata is missing or invalid");
        return iconKey;
    }

    async getDefinition(id: string, workspaceId: string): Promise<ConnectionDefinition & { iconKey: string; discovery: { sources: ConnectorDiscoveryMetadata["sources"]; instructions: string } | null }> {
        const item = await this.definitionRepository.findInWorkspace(id, workspaceId);
        if (!item) throw new AppError(404, "Connection definition not found");
        const discovery = discoveryOf(item.configSchema);
        return { ...item, iconKey: this.definitionIcon(item.configSchema), discovery: discovery ? { sources: discovery.sources, instructions: discovery.blueprint.instructions } : null };
    }

    private async enabledDefinition(id: string, workspaceId: string): Promise<ConnectionDefinition> {
        const item = await this.getDefinition(id, workspaceId);
        if (!item.isEnabled) throw new AppError(422, "This integration is not currently supported");
        return item;
    }

    private async owned(id: string, workspaceId: string): Promise<Connection> {
        const connection = await this.repository.findInWorkspace(id, workspaceId);
        if (!connection) throw new AppError(404, "Connection not found");
        return connection;
    }

    private async serialize(connection: Connection) {
        const definition = await this.getDefinition(connection.definitionId, connection.workspaceId);
        const configuration = this.credentials.split(definition.configSchema, connection.configuration).publicConfiguration;
        let configuredSecretFields: string[] = [];
        let credentialError: string | null = null;
        try {
            configuredSecretFields = Object.keys(this.credentials.decrypt(connection.credentialReference, connection.workspaceId));
        } catch (error) {
            if (!(error instanceof ConnectionCredentialsUnavailableError)) throw error;
            credentialError = error.message;
        }
        return {
            id: connection.id,
            workspaceId: connection.workspaceId,
            definitionId: connection.definitionId,
            name: connection.name,
            provider: definition.name,
            access: connectionAgentAccess(definition.adapterKey),
            dataStream: connection.dataStream,
            status: credentialError ? "error" : connection.status === "connected" && !this.active.has(connection.id) ? "disconnected" : connection.status,
            configuration,
            configuredSecretFields,
            credentialError,
            verifiedAt: connection.verifiedAt,
            verificationMetadata: connection.verificationMetadata,
            lastSyncedAt: connection.lastSyncedAt,
            createdAt: connection.createdAt,
            updatedAt: connection.updatedAt,
        };
    }

    /**
     * A verified live handle for reading a connection, with what describes it. A saved connection that is not live
     * (after a restart, for example) is re-verified with its stored credentials first. Only connections in the
     * workspace are returned; credentials never leave this service.
     */
    async readerFor(id: string, workspaceId: string): Promise<ConnectionReader> {
        const connection = await this.owned(id, workspaceId);
        const definition = await this.enabledDefinition(connection.definitionId, workspaceId);
        let active = this.active.get(id);
        if (!active || active.workspaceId !== workspaceId) {
            await this.reconnectOnce(id, workspaceId);
            active = this.active.get(id);
        }
        if (!active) throw new AppError(503, "The connection could not be reached. Reconnect it from the Connectors page.");
        const { publicConfiguration } = this.credentials.split(definition.configSchema, connection.configuration);
        return {
            id: connection.id,
            name: connection.name,
            provider: definition.name,
            adapterKey: definition.adapterKey,
            configuration: compileDiscoveredConfiguration(definition.configSchema, publicConfiguration),
            metadata: active.handle.metadata,
            handle: active.handle,
        };
    }

    private reconnectOnce(id: string, workspaceId: string): Promise<unknown> {
        const running = this.reconnecting.get(id);
        if (running) return running;
        const attempt = this.reconnect(id, workspaceId).finally(() => this.reconnecting.delete(id));
        this.reconnecting.set(id, attempt);
        return attempt;
    }

    async listByWorkspace(workspaceId: string) {
        const rows = await this.repository.listByWorkspace(workspaceId);
        return Promise.all(rows.map(row => this.serialize(row)));
    }

    async findById(id: string, workspaceId: string) {
        return this.serialize(await this.owned(id, workspaceId));
    }

    private async connect(definition: ConnectionDefinition, configuration: Record<string, unknown>, name: string, workspaceId: string) {
        this.validator.validate(definition.configSchema, configuration);
        const state: { id: string | null; handle: ConnectorHandle | null; closed: boolean } = { id: null, handle: null, closed: false };
        try {
            const handle = await this.adapters.connect(definition.adapterKey, compileDiscoveredConfiguration(definition.configSchema, configuration), {
                workspaceId,
                connectionName: name,
                onDisconnect: () => {
                    state.closed = true;
                    if (state.id && this.active.get(state.id)?.handle === state.handle) {
                        const id = state.id;
                        this.active.delete(id);
                        void this.repository.updateInWorkspace(id, workspaceId, { status: "error" }).catch(() => {});
                    }
                },
            });
            state.handle = handle;
            if (state.closed) {
                await handle.close();
                throw new AppError(422, "The provider closed the connection during verification");
            }
            return {
                handle,
                attach: async (id: string) => {
                    const previous = this.active.get(id);
                    this.active.delete(id);
                    if (previous) await previous.handle.close();
                    state.id = id;
                    if (state.closed) throw new AppError(422, "The provider disconnected before the connection could be saved");
                    this.active.set(id, { handle, workspaceId });
                },
            };
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(422, "Connection verification failed. Check the provider settings, credentials, and service availability.");
        }
    }

    async verify(input: Omit<CreateConnectionInput, "dataStream">) {
        const definition = await this.enabledDefinition(input.definitionId, input.workspaceId);
        const configuration = this.validator.visibleConfiguration(definition.configSchema, input.configuration);
        const session = await this.connect(definition, configuration, input.name, input.workspaceId);
        try {
            return { success: true, metadata: session.handle.metadata };
        } finally {
            await session.handle.close();
        }
    }

    async create(input: CreateConnectionInput) {
        const definition = await this.enabledDefinition(input.definitionId, input.workspaceId);
        const configuration = this.validator.visibleConfiguration(definition.configSchema, input.configuration);
        const session = await this.connect(definition, configuration, input.name, input.workspaceId);
        let created: Connection | undefined;
        try {
            const { publicConfiguration, secrets } = this.credentials.split(definition.configSchema, configuration);
            const connection = await this.repository.create({
                workspaceId: input.workspaceId,
                definitionId: definition.id,
                name: input.name,
                provider: definition.name,
                dataStream: input.dataStream === undefined ? null : input.dataStream,
                configuration: publicConfiguration,
                credentialReference: this.credentials.encrypt(secrets, input.workspaceId),
                status: "connected",
                verifiedAt: new Date(),
                verificationMetadata: session.handle.metadata,
            });
            created = connection;
            await session.attach(connection.id);
            return this.serialize(connection);
        } catch (error) {
            if (created) {
                this.active.delete(created.id);
                await this.repository.updateInWorkspace(created.id, input.workspaceId, { status: "error" });
            }
            await session.handle.close().catch(() => {});
            throw error;
        }
    }

    async update(id: string, workspaceId: string, input: UpdateConnectionInput) {
        const existing = await this.owned(id, workspaceId);
        const changes: Partial<NewConnection> = {};
        if (input.name !== undefined) changes.name = input.name;
        if (input.dataStream !== undefined) changes.dataStream = input.dataStream;
        if (input.configuration === undefined) {
            const updated = await this.repository.updateInWorkspace(id, workspaceId, changes);
            if (!updated) throw new AppError(404, "Connection not found");
            return this.serialize(updated);
        }
        const definition = await this.enabledDefinition(existing.definitionId, workspaceId);
        const storedSecrets = input.replaceCredentials ? {} : this.credentials.decrypt(existing.credentialReference, workspaceId);
        const configuration = this.validator.visibleConfiguration(definition.configSchema, {
            ...storedSecrets,
            ...input.configuration,
        });
        let session;
        try {
            session = await this.connect(definition, configuration, input.name === undefined ? existing.name : input.name, workspaceId);
        } catch (error) {
            if (!this.active.has(id)) await this.repository.updateInWorkspace(id, workspaceId, { status: "error" });
            throw error;
        }
        try {
            const { publicConfiguration, secrets } = this.credentials.split(definition.configSchema, configuration);
            const updated = await this.repository.updateInWorkspace(id, workspaceId, {
                ...changes,
                configuration: publicConfiguration,
                credentialReference: this.credentials.encrypt(secrets, workspaceId),
                status: "connected",
                verifiedAt: new Date(),
                verificationMetadata: session.handle.metadata,
            });
            if (!updated) throw new AppError(404, "Connection not found");
            await session.attach(id);
            return this.serialize(updated);
        } catch (error) {
            if (this.active.get(id)?.handle === session.handle) this.active.delete(id);
            await this.repository.updateInWorkspace(id, workspaceId, { status: "error" });
            await session.handle.close().catch(() => {});
            throw error;
        }
    }

    async reconnect(id: string, workspaceId: string) {
        const existing = await this.owned(id, workspaceId);
        return this.update(id, workspaceId, { configuration: existing.configuration });
    }

    async disconnect(id: string, workspaceId: string) {
        await this.owned(id, workspaceId);
        const active = this.active.get(id);
        this.active.delete(id);
        let closeError: unknown;
        try { if (active) await active.handle.close(); }
        catch (error) { closeError = error; }
        const updated = await this.repository.updateInWorkspace(id, workspaceId, { status: "disconnected" });
        if (!updated) throw new AppError(404, "Connection not found");
        if (closeError) throw new AppError(502, "Connection status was updated, but the provider did not confirm session cleanup");
        return this.serialize(updated);
    }

    async delete(id: string, workspaceId: string) {
        await this.disconnect(id, workspaceId);
        return { success: await this.repository.deleteInWorkspace(id, workspaceId) };
    }

    async close(): Promise<void> {
        const active = [...this.active.entries()];
        this.active.clear();
        await Promise.allSettled(active.map(async ([id, connection]) => {
            try { await connection.handle.close(); }
            finally { await this.repository.updateInWorkspace(id, connection.workspaceId, { status: "disconnected" }); }
        }));
    }
}

