import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";

// Register before any routes/plugins so every scope inherits the transport guard.
export function registerDesktopTransport(app: FastifyInstance, token: string): void {
    const expected = Buffer.from(token);
    app.addHook("onRequest", async (request, reply) => {
        const supplied = Buffer.from(String(request.headers["x-detqel-desktop-token"] ?? ""));
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
            return reply.code(401).send({ message: "Unauthorized desktop request" });
        }
    });
}
