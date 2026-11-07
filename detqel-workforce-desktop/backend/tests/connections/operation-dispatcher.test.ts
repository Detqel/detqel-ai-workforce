import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { ConnectorOperationDispatcher } from "../../src/modules/connections/operations/operation-dispatcher.js";
import type { ConnectorHandle, ConnectorOperationRequest, ConnectorOperationResult } from "../../src/shared/types/connector-catalog.js";
import { CONNECTOR_OPERATIONS, CONNECTOR_OPERATION_KINDS } from "../../src/constants/connectorOperationConstants.js";

const SESSION = "session-1";
const CONNECTION = "connection-1";

/** A handle that records every executed operation so the test can assert what actually ran. */
function recordingHandle(): ConnectorHandle & { executed: ConnectorOperationRequest[] } {
    const executed: ConnectorOperationRequest[] = [];
    return {
        executed,
        metadata: {},
        async close() {},
        async execute(request: ConnectorOperationRequest): Promise<ConnectorOperationResult> {
            executed.push(request);
            return { data: { ok: true } };
        },
    };
}

describe("ConnectorOperationDispatcher", () => {
    test("classifies fixed read and mutating operations", () => {
        const dispatcher = new ConnectorOperationDispatcher(() => null);
        assert.equal(dispatcher.classify(CONNECTOR_OPERATIONS.read), CONNECTOR_OPERATION_KINDS.read);
        assert.equal(dispatcher.classify(CONNECTOR_OPERATIONS.query), CONNECTOR_OPERATION_KINDS.read);
        assert.equal(dispatcher.classify(CONNECTOR_OPERATIONS.write), CONNECTOR_OPERATION_KINDS.mutating);
        assert.equal(dispatcher.classify(CONNECTOR_OPERATIONS.delete), CONNECTOR_OPERATION_KINDS.mutating);
    });

    test("classifies invoke-tool per call from the declared mutating flag", () => {
        const dispatcher = new ConnectorOperationDispatcher(() => null);
        assert.equal(dispatcher.classify(CONNECTOR_OPERATIONS.invokeTool, false), CONNECTOR_OPERATION_KINDS.read);
        assert.equal(dispatcher.classify(CONNECTOR_OPERATIONS.invokeTool, true), CONNECTOR_OPERATION_KINDS.mutating);
    });

    test("an unknown operation is rejected", () => {
        const dispatcher = new ConnectorOperationDispatcher(() => null);
        assert.throws(() => dispatcher.classify("destroy-everything"), /unknown connector operation/i);
    });

    test("a read operation runs autonomously against an attached connection", async () => {
        const handle = recordingHandle();
        const dispatcher = new ConnectorOperationDispatcher(id => (id === CONNECTION ? handle : null));
        const decision = await dispatcher.dispatch({ sessionId: SESSION, connectionId: CONNECTION, operation: CONNECTOR_OPERATIONS.read, parameters: {} });
        assert.equal(decision.confirmationRequired, false);
        assert.deepEqual(decision.result?.data, { ok: true });
        assert.equal(handle.executed.length, 1);
    });

    test("a mutating operation without confirmation does not execute and reports confirmation required", async () => {
        const handle = recordingHandle();
        const dispatcher = new ConnectorOperationDispatcher(() => handle);
        const decision = await dispatcher.dispatch({ sessionId: SESSION, connectionId: CONNECTION, operation: CONNECTOR_OPERATIONS.write, parameters: { path: "x" } });
        assert.equal(decision.confirmationRequired, true);
        assert.equal(decision.result, undefined);
        assert.equal(handle.executed.length, 0, "a mutating operation must never run before confirmation");
    });

    test("a mutating operation runs once confirmed", async () => {
        const handle = recordingHandle();
        const dispatcher = new ConnectorOperationDispatcher(() => handle);
        const decision = await dispatcher.dispatch({ sessionId: SESSION, connectionId: CONNECTION, operation: CONNECTOR_OPERATIONS.update, parameters: {}, confirmed: true });
        assert.equal(decision.confirmationRequired, false);
        assert.equal(handle.executed.length, 1);
    });

    test("a declared-mutating MCP tool is gated even though invoke-tool can be read", async () => {
        const handle = recordingHandle();
        const dispatcher = new ConnectorOperationDispatcher(() => handle);
        const decision = await dispatcher.dispatch({ sessionId: SESSION, connectionId: CONNECTION, operation: CONNECTOR_OPERATIONS.invokeTool, parameters: {}, declaredMutating: true });
        assert.equal(decision.confirmationRequired, true);
        assert.equal(handle.executed.length, 0);
    });

    test("an operation against a connection not attached to the session is refused", async () => {
        const dispatcher = new ConnectorOperationDispatcher(() => null);
        await assert.rejects(
            () => dispatcher.dispatch({ sessionId: SESSION, connectionId: "other", operation: CONNECTOR_OPERATIONS.read, parameters: {} }),
            /not attached to this discussion session/,
        );
    });

    test("an attached connection whose adapter cannot execute operations is refused", async () => {
        const verifyOnly: ConnectorHandle = { metadata: {}, async close() {} };
        const dispatcher = new ConnectorOperationDispatcher(() => verifyOnly);
        await assert.rejects(
            () => dispatcher.dispatch({ sessionId: SESSION, connectionId: CONNECTION, operation: CONNECTOR_OPERATIONS.read, parameters: {} }),
            /does not support the requested operation/,
        );
    });
});
