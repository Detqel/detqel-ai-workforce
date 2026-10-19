import test from "node:test";
import assert from "node:assert/strict";
import { formatLogLine, formatTimestamp } from "../src/shared/logging/logger.js";

test("formatTimestamp generates proper YYYY-MM-DD HH:mm:ss.SSS format", () => {
    const fixedDate = new Date("2026-10-10T20:57:32.122Z");
    const formatted = formatTimestamp(fixedDate);
    assert.match(formatted, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
});

test("formatLogLine formats QueueService and Workflow logs matching requested reference", () => {
    const queueLog = JSON.stringify({
        level: 30,
        time: 1791688702159,
        context: "QueueService",
        msg: "Starting job workflow-1790319968182-kl3i3g (Active: 1/10)",
    });
    const formattedQueue = formatLogLine(queueLog);
    assert.match(formattedQueue, /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[QueueService\] Starting job workflow-1790319968182-kl3i3g \(Active: 1\/10\)$/);

    const workflowLog = JSON.stringify({
        level: 30,
        time: 1791688702160,
        context: "Workflow",
        msg: "Starting new workflow, thread workflow-1790319968182-kl3i3g, connectors: [c7d222c8-f663-4384-a467-30ff3c895f8f]",
    });
    const formattedWorkflow = formatLogLine(workflowLog);
    assert.match(formattedWorkflow, /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[Workflow\] Starting new workflow, thread workflow-1790319968182-kl3i3g, connectors: \[c7d222c8-f663-4384-a467-30ff3c895f8f\]$/);
});

test("formatLogLine defaults context to Server for Fastify server listening log", () => {
    const serverLog = JSON.stringify({
        level: 30,
        time: 1791688702159,
        msg: "Server listening at http://127.0.0.1:8100",
    });
    const formattedServer = formatLogLine(serverLog);
    assert.match(formattedServer, /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[Server\] Server listening at http:\/\/127\.0\.0\.1:8100$/);
});
