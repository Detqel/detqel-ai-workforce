import { PassThrough } from "node:stream";
import type { FastifyReply } from "fastify";
import { AppError } from "../errors/app-error.js";
import { createScopedLogger } from "../logging/logger.js";
import { HTTP_EVENT_STREAM } from "../../constants/apiConstants.js";

const logger = createScopedLogger("event-stream");

export interface StreamedEvent {
    readonly type: string;
}

/**
 * Sends a response as newline-delimited JSON events while `run` produces them. The run is aborted when the
 * client disconnects. A failure after streaming began is reported as a final error event. Application errors
 * carry messages written for the user (such as the AI gateway being unreachable), so they are shown; any
 * other error is reported generically and never reveals internal details.
 */
export function sendEventStream(
    reply: FastifyReply,
    run: (emit: (event: StreamedEvent) => void, signal: AbortSignal) => Promise<void>,
): FastifyReply {
    const body = new PassThrough();
    const controller = new AbortController();
    reply.raw.on("close", () => {
        if (!reply.raw.writableFinished) controller.abort();
    });
    const emit = (event: StreamedEvent) => {
        if (!body.writableEnded && !controller.signal.aborted) body.write(`${JSON.stringify(event)}\n`);
    };
    void run(emit, controller.signal)
        .catch(error => {
            if (controller.signal.aborted) return;
            const known = error instanceof AppError;
            if (!known || error.statusCode >= 500) logger.error({ error: String(error) }, "Streamed request failed");
            emit({ type: HTTP_EVENT_STREAM.errorEvent, message: known ? error.message : HTTP_EVENT_STREAM.genericError } as StreamedEvent);
        })
        .finally(() => body.end());
    return reply
        .header("content-type", HTTP_EVENT_STREAM.contentType)
        // Proxies and the desktop bridge must pass each event on as it is written.
        .header("cache-control", HTTP_EVENT_STREAM.cacheControl)
        .header("x-accel-buffering", "no")
        .send(body);
}
