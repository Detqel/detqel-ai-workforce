import type { FastifyPluginAsync } from "fastify";
import { ConnectionController } from "../controllers/connection.controller.js";
export const connectionRoutes: FastifyPluginAsync = async (app) => {
    const controller = new ConnectionController(app.services.connections);
    app.get("/connections", {
        schema: { tags: ["Connections"], summary: "List external connections for workspace" },
    }, controller.list.bind(controller));
    app.post("/connections", {
        schema: { tags: ["Connections"], summary: "Create external connection" },
    }, controller.create.bind(controller));
    app.get("/connections/:id", {
        schema: { tags: ["Connections"], summary: "Get connection details" },
    }, controller.getById.bind(controller));
    app.patch("/connections/:id/sync", {
        schema: { tags: ["Connections"], summary: "Trigger connection sync and update status" },
    }, controller.sync.bind(controller));
    app.delete("/connections/:id", {
        schema: { tags: ["Connections"], summary: "Delete connection" },
    }, controller.delete.bind(controller));
};
