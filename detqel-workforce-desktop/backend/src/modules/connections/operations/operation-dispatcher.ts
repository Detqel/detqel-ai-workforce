import { AppError } from "../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../shared/logging/logger.js";
import type { ConnectorHandle, ConnectorOperationResult } from "../../../shared/types/connector-catalog.js";
import {
    CONNECTOR_OPERATION_CLASSIFICATION,
    CONNECTOR_OPERATION_ERRORS,
    CONNECTOR_OPERATION_KINDS,
    type ConnectorOperation,
    type ConnectorOperationKind,
} from "../../../constants/connectorOperationConstants.js";

const logger = createScopedLogger("connector-operations");

/** Resolves the live handle for a connection attached to the current session, or null when not attached. */
export type SessionHandleResolver = (connectionId: string) => ConnectorHandle | null;

export interface DispatchRequest {
    readonly sessionId: string;
    readonly connectionId: string;
    readonly operation: string;
    readonly parameters: Readonly<Record<string, unknown>>;
    /** For invoke-tool, whether the specific tool mutates state. Ignored for fixed-kind operations. */
    readonly declaredMutating?: boolean;
    /** True only when the user has already confirmed this exact mutating operation. */
    readonly confirmed?: boolean;
}

export interface DispatchDecision {
    readonly kind: ConnectorOperationKind;
    /** Present when a mutating operation needs confirmation before it can run. */
    readonly confirmationRequired: boolean;
    /** The operation result, present only when the operation actually executed. */
    readonly result?: ConnectorOperationResult;
}

/**
 * Enforces the connector security policy for a discussion session: an operation may only target a connection
 * attached to that session, read operations run autonomously, and every mutating operation (including a
 * mutating MCP tool) must be confirmed before it executes. The dispatcher never downgrades a declared-mutating
 * operation to a read.
 */
export class ConnectorOperationDispatcher {
    constructor(private readonly resolveHandle: SessionHandleResolver) {}

    /** Returns the classification without executing. Used by the UI to decide whether to prompt first. */
    classify(operation: string, declaredMutating?: boolean): ConnectorOperationKind {
        const fixed = CONNECTOR_OPERATION_CLASSIFICATION[operation as ConnectorOperation];
        if (fixed === undefined) throw new AppError(400, CONNECTOR_OPERATION_ERRORS.unknownOperation);
        if (fixed === "per-call") {
            return declaredMutating ? CONNECTOR_OPERATION_KINDS.mutating : CONNECTOR_OPERATION_KINDS.read;
        }
        return fixed;
    }

    async dispatch(request: DispatchRequest): Promise<DispatchDecision> {
        const kind = this.classify(request.operation, request.declaredMutating);
        const handle = this.resolveHandle(request.connectionId);
        if (handle === null) throw new AppError(403, CONNECTOR_OPERATION_ERRORS.notAttached);
        if (typeof handle.execute !== "function") throw new AppError(422, CONNECTOR_OPERATION_ERRORS.unsupported);

        if (kind === CONNECTOR_OPERATION_KINDS.mutating && request.confirmed !== true) {
            logger.info({ sessionId: request.sessionId, connectionId: request.connectionId, operation: request.operation }, "Mutating connector operation awaiting confirmation");
            return { kind, confirmationRequired: true };
        }

        const result = await handle.execute({
            operation: request.operation,
            parameters: request.parameters,
            declaredMutating: request.declaredMutating,
        });
        logger.info({ sessionId: request.sessionId, connectionId: request.connectionId, operation: request.operation, kind }, "Executed connector operation");
        return { kind, confirmationRequired: false, result };
    }
}
