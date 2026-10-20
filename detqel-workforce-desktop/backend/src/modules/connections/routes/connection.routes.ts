import type { FastifyPluginAsync } from "fastify";
import { ConnectionController } from "../controllers/connection.controller.js";

export const connectionRoutes: FastifyPluginAsync = async (app) => {
    const controller = new ConnectionController(app.services.connections, app.services.connectionAccess);
    const schema = (summary: string) => ({ schema: { tags: ["Connections"], summary } });

    app.get("/connector-catalog", schema("List enabled connector integrations"), controller.catalog.bind(controller));
    app.get("/connector-catalog/:id", schema("Get connector configuration schema"), controller.catalogById.bind(controller));
    app.get("/connections", schema("List workspace connections"), controller.list.bind(controller));
    app.post("/connections", schema("Verify and create a workspace connection"), controller.create.bind(controller));
    app.post("/connections/test", schema("Verify connection configuration without saving"), controller.test.bind(controller));
    app.get("/connections/:id", schema("Get workspace connection details"), controller.getById.bind(controller));
    app.patch("/connections/:id", schema("Reconfigure and verify a workspace connection"), controller.update.bind(controller));
    app.post("/connections/:id/reconnect", schema("Reconnect and discover provider capabilities"), controller.reconnect.bind(controller));
    app.post("/connections/:id/disconnect", schema("Disconnect a workspace connection"), controller.disconnect.bind(controller));
    // Preserve the old route while replacing its former unconditional success with real verification.
    app.patch("/connections/:id/sync", schema("Verify an existing connection"), controller.reconnect.bind(controller));
    app.delete("/connections/:id", schema("Disconnect and delete a workspace connection"), controller.delete.bind(controller));
};

