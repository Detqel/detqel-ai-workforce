import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fastify from "fastify";
import { sendEventStream } from "../src/shared/http/event-stream.js";
import { AppError } from "../src/shared/errors/app-error.js";

async function serve(run: Parameters<typeof sendEventStream>[1]) {
    const app = fastify({ logger: false });
    app.get("/events", (_request, reply) => sendEventStream(reply, run));
    await app.ready();
    return app;
}

const lines = (body: string) => body.trim().split("\n").map(line => JSON.parse(line));

describe("sendEventStream", () => {
    test("writes each event as one JSON line, unbuffered, then ends", async () => {
        const app = await serve(async emit => {
            emit({ type: "speaker", name: "Ana" } as never);
            emit({ type: "token", text: "Hi\nthere" } as never);
        });
        try {
            const response = await app.inject("/events");
            assert.equal(response.statusCode, 200);
            assert.match(String(response.headers["content-type"]), /application\/x-ndjson/);
            assert.equal(response.headers["cache-control"], "no-cache, no-transform");
            assert.equal(response.headers["x-accel-buffering"], "no");
            assert.deepEqual(lines(response.body), [{ type: "speaker", name: "Ana" }, { type: "token", text: "Hi\nthere" }], "a newline inside text never splits an event");
        } finally {
            await app.close();
        }
    });

    test("a failure the user can act on ends the stream with its message", async () => {
        const app = await serve(async emit => {
            emit({ type: "speaker" });
            throw new AppError(409, "Web search is not configured.");
        });
        try {
            assert.deepEqual(lines((await app.inject("/events")).body), [{ type: "speaker" }, { type: "error", message: "Web search is not configured." }]);
        } finally {
            await app.close();
        }
    });

    test("an application failure such as an unreachable gateway reaches the user with its written message", async () => {
        const app = await serve(async () => {
            throw new AppError(502, "The local AI gateway could not complete the model request.");
        });
        try {
            assert.deepEqual(lines((await app.inject("/events")).body), [{ type: "error", message: "The local AI gateway could not complete the model request." }]);
        } finally {
            await app.close();
        }
    });

    test("an internal failure ends the stream without revealing its details", async () => {
        const app = await serve(async () => {
            throw new Error("connection to postgres://user:secret@db failed");
        });
        try {
            const body = (await app.inject("/events")).body;
            assert.deepEqual(lines(body), [{ type: "error", message: "An unexpected error occurred" }]);
            assert.doesNotMatch(body, /secret|postgres/);
        } finally {
            await app.close();
        }
    });

    test("a client that disconnects aborts the run", async () => {
        let aborted!: () => void;
        const wasAborted = new Promise<void>(resolve => { aborted = resolve; });
        const app = fastify({ logger: false });
        app.get("/events", (_request, reply) => sendEventStream(reply, (emit, signal) => new Promise<void>(resolve => {
            emit({ type: "speaker" });
            signal.addEventListener("abort", () => { aborted(); resolve(); }, { once: true });
        })));
        const address = await app.listen({ port: 0, host: "127.0.0.1" });
        try {
            const controller = new AbortController();
            const response = await fetch(`${address}/events`, { signal: controller.signal });
            const reader = response.body!.getReader();
            const first = new TextDecoder().decode((await reader.read()).value);
            assert.deepEqual(JSON.parse(first.trim()), { type: "speaker" }, "the first event arrives before the run finishes");
            controller.abort();
            await wasAborted;
        } finally {
            await app.close();
        }
    });
});
