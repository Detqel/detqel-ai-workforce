import { FastifyPluginAsync } from "fastify";
const healthResponse = {
    type: "object",
    properties: {
        status: { type: "string" }, uptime: { type: "number" },
        timestamp: { type: "string" }, database: { type: "string" },
    },
};
export const healthRoutes: FastifyPluginAsync = async (app) => {
    app.get("/health", {
        schema: {
            description: "Service and database health check",
            tags: ["System"],
            response: {
                200: healthResponse,
                503: healthResponse,
            },
        },
    }, async (request, reply) => {
        const health = await app.services.health.check();
        return reply.code(health.database === "connected" ? 200 : 503).send({
            ...health,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        });
    });
    app.get("/health/live", { schema: { tags: ["System"], summary: "Process liveness" } }, async () => ({ status: "ok" }));
};
