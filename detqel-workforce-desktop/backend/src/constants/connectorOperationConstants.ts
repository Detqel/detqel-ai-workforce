/**
 * Connector operations are the actions an agent may perform through a verified connection during a discussion.
 * Every operation is classified as read or mutating. Read operations run autonomously; mutating operations are
 * always gated behind an explicit confirmation before they execute. Connectors are attached per chat session,
 * so an operation is only permitted against a connection attached to that session.
 */
export const CONNECTOR_OPERATION_KINDS = {
    read: "read",
    mutating: "mutating",
} as const;

export type ConnectorOperationKind = (typeof CONNECTOR_OPERATION_KINDS)[keyof typeof CONNECTOR_OPERATION_KINDS];

/** The operation verbs an adapter may expose. Each maps to a fixed kind in CONNECTOR_OPERATION_CLASSIFICATION. */
export const CONNECTOR_OPERATIONS = {
    read: "read",
    list: "list",
    fetch: "fetch",
    query: "query",
    invokeTool: "invoke-tool",
    write: "write",
    update: "update",
    delete: "delete",
} as const;

export type ConnectorOperation = (typeof CONNECTOR_OPERATIONS)[keyof typeof CONNECTOR_OPERATIONS];

/**
 * Fixed read/mutating classification per operation. invoke-tool is classified per call because an MCP tool can
 * be read-only or mutating; the dispatcher resolves it from the caller-declared mutating flag and never
 * downgrades a declared-mutating tool to a read.
 */
export const CONNECTOR_OPERATION_CLASSIFICATION: Readonly<Record<ConnectorOperation, ConnectorOperationKind | "per-call">> = {
    [CONNECTOR_OPERATIONS.read]: CONNECTOR_OPERATION_KINDS.read,
    [CONNECTOR_OPERATIONS.list]: CONNECTOR_OPERATION_KINDS.read,
    [CONNECTOR_OPERATIONS.fetch]: CONNECTOR_OPERATION_KINDS.read,
    [CONNECTOR_OPERATIONS.query]: CONNECTOR_OPERATION_KINDS.read,
    [CONNECTOR_OPERATIONS.invokeTool]: "per-call",
    [CONNECTOR_OPERATIONS.write]: CONNECTOR_OPERATION_KINDS.mutating,
    [CONNECTOR_OPERATIONS.update]: CONNECTOR_OPERATION_KINDS.mutating,
    [CONNECTOR_OPERATIONS.delete]: CONNECTOR_OPERATION_KINDS.mutating,
};

export const CONNECTOR_OPERATION_ERRORS = {
    unsupported: "This connector does not support the requested operation.",
    notAttached: "The connector is not attached to this discussion session.",
    confirmationRequired: "This operation changes data and must be confirmed before it runs.",
    readOnlyQuery: "Only read-only queries run without confirmation; a data-changing query must be confirmed.",
    unknownOperation: "An unknown connector operation was requested.",
} as const;
