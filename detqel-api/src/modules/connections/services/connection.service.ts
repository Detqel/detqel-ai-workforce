import { AppError } from "../../../shared/errors/app-error.js";
import type { ConnectorCatalog, Connection, NewConnection } from "../../../shared/types/entities.js";
import type { ConfigurationSchema, ConnectorHandle } from "../../../shared/types/connector-catalog.js";
import type { ConnectorAdapterRegistry } from "../adapters/connector-adapter.registry.js";
import type { IConnectionRepository } from "../repositories/connection.repository.js";
import type { IConnectorCatalogRepository } from "../repositories/connector-catalog.repository.js";
import { ConfigurationValidator } from "../validation/configuration.validator.js";
import type { CreateConnectionInput, UpdateConnectionInput } from "../validation/connection.schemas.js";
import type { ConnectionCredentialsService } from "./connection-credentials.service.js";

interface ActiveConnection {
    handle: ConnectorHandle;
    workspaceId: string;
}

export class ConnectionService {
    private readonly active = new Map<string, ActiveConnection>();
    private readonly validator = new ConfigurationValidator();

    constructor(
        private readonly repository: IConnectionRepository,
        private readonly catalogRepository: IConnectorCatalogRepository,
        private readonly credentials: ConnectionCredentialsService,
        private readonly adapters: ConnectorAdapterRegistry,
    ) {}

    async listCatalog(connectorType?: string, category?: string) {
        const entries = await this.catalogRepository.listEnabled(connectorType, category);
        return entries.map(({ configSchema, ...entry }) => ({ ...entry, iconKey: this.catalogIcon(configSchema) }));
    }

    private catalogIcon(schema: ConfigurationSchema): string {
        const iconKey = schema["x-icon"];
        if (typeof iconKey !== "string" || !iconKey.trim()) throw new AppError(500, "Connector catalog icon metadata is missing or invalid");
        return iconKey;
    }

    async getCatalog(id: string): Promise<ConnectorCatalog & { iconKey: string }> {
        const item = await this.catalogRepository.findById(id);
        if (!item) throw new AppError(404, "Connector catalog entry not found");
        return { ...item, iconKey: this.catalogIcon(item.configSchema) };
    }

    private async enabledCatalog(id: string): Promise<ConnectorCatalog> {
        const item = await this.getCatalog(id);
        if (!item.isEnabled) throw new AppError(422, "This integration is not currently supported");
        return item;
    }

    private async owned(id: string, workspaceId: string): Promise<Connection> {
        const connection = await this.repository.findInWorkspace(id, workspaceId);
        if (!connection) throw new AppError(404, "Connection not found");
        return connection;
    }

    private async serialize(connection: Connection) {
        let configuration: Record<string, unknown> = {};
        let configuredSecretFields: string[] = [];
        if (connection.catalogId) {
            const catalog = await this.getCatalog(connection.catalogId);
            configuration = this.credentials.split(catalog.configSchema, connection.configuration).publicConfiguration;
            configuredSecretFields = Object.keys(this.credentials.decrypt(connection.credentialReference, connection.workspaceId));
        }
        return {
            id: connection.id,
            workspaceId: connection.workspaceId,
            catalogId: connection.catalogId,
            name: connection.name,
            provider: connection.provider,
            connectionType: connection.connectionType,
            dataStream: connection.dataStream,
            status: connection.catalogId && connection.status === "connected" && !this.active.has(connection.id) ? "disconnected" : connection.status,
            configuration,
            configuredSecretFields,
            verifiedAt: connection.verifiedAt,
            verificationMetadata: connection.verificationMetadata,
            lastSyncedAt: connection.lastSyncedAt,
            createdAt: connection.createdAt,
            updatedAt: connection.updatedAt,
        };
    }

    async listByWorkspace(workspaceId: string) {
        const rows = await this.repository.listByWorkspace(workspaceId);
        return Promise.all(rows.map(row => this.serialize(row)));
    }

    async findById(id: string, workspaceId: string) {
        return this.serialize(await this.owned(id, workspaceId));
    }

    private async connect(catalog: ConnectorCatalog, configuration: Record<string, unknown>, name: string, workspaceId: string) {
        this.validator.validate(catalog.configSchema, configuration);
        const state: { id: string | null; handle: ConnectorHandle | null; closed: boolean } = { id: null, handle: null, closed: false };
        try {
            const handle = await this.adapters.connect(catalog.adapterKey, configuration, {
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
        const catalog = await this.enabledCatalog(input.catalogId);
        const configuration = this.validator.visibleConfiguration(catalog.configSchema, input.configuration);
        const session = await this.connect(catalog, configuration, input.name, input.workspaceId);
        try {
            return { success: true, metadata: session.handle.metadata };
        } finally {
            await session.handle.close();
        }
    }

    async create(input: CreateConnectionInput) {
        const catalog = await this.enabledCatalog(input.catalogId);
        const configuration = this.validator.visibleConfiguration(catalog.configSchema, input.configuration);
        const session = await this.connect(catalog, configuration, input.name, input.workspaceId);
        let created: Connection | undefined;
        try {
            const { publicConfiguration, secrets } = this.credentials.split(catalog.configSchema, configuration);
            const connection = await this.repository.create({
                workspaceId: input.workspaceId,
                catalogId: catalog.id,
                name: input.name,
                provider: catalog.name,
                connectionType: catalog.connectorType,
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
        if (!existing.catalogId) throw new AppError(409, "Legacy connections must be recreated from the catalog to configure a provider");
        const catalog = await this.enabledCatalog(existing.catalogId);
        const storedSecrets = this.credentials.decrypt(existing.credentialReference, workspaceId);
        const configuration = this.validator.visibleConfiguration(catalog.configSchema, {
            ...storedSecrets,
            ...input.configuration,
        });
        let session;
        try {
            session = await this.connect(catalog, configuration, input.name === undefined ? existing.name : input.name, workspaceId);
        } catch (error) {
            if (!this.active.has(id)) await this.repository.updateInWorkspace(id, workspaceId, { status: "error" });
            throw error;
        }
        try {
            const { publicConfiguration, secrets } = this.credentials.split(catalog.configSchema, configuration);
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

