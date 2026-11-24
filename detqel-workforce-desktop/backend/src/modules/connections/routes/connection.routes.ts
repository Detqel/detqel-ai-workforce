import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { ConnectionController } from "../controllers/connection.controller.js";
import { CONNECTOR_FILE_LIMITS } from "../../../constants/connectorFileConstants.js";

export const connectionRoutes: FastifyPluginAsync = async (app) => {
    const controller = new ConnectionController(app.services.connections, app.services.workspaceAccess, app.services.connectorDiscovery);
    const schema = (summary: string) => ({ schema: { tags: [API_TAG_NAMES.connections], summary } });

    app.post("/connections/discover", { ...schema("Discover documented provider connections using workspace web search"), bodyLimit: 4096 }, controller.discover.bind(controller));
    app.get("/connection-definitions/:id", schema("Get discovered connection configuration"), controller.definitionById.bind(controller));
    app.get("/connections", schema("List workspace connections"), controller.list.bind(controller));
    app.post("/connections", { ...schema("Verify and create a workspace connection"), bodyLimit: CONNECTOR_FILE_LIMITS.requestBytes }, controller.create.bind(controller));
    app.post("/connections/test", { ...schema("Verify connection configuration without saving"), bodyLimit: CONNECTOR_FILE_LIMITS.requestBytes }, controller.test.bind(controller));
    app.get("/connections/:id", schema("Get workspace connection details"), controller.getById.bind(controller));
    app.patch("/connections/:id", { ...schema("Reconfigure and verify a workspace connection"), bodyLimit: CONNECTOR_FILE_LIMITS.requestBytes }, controller.update.bind(controller));
    app.post("/connections/:id/reconnect", schema("Reconnect and discover provider capabilities"), controller.reconnect.bind(controller));
    app.post("/connections/:id/disconnect", schema("Disconnect a workspace connection"), controller.disconnect.bind(controller));
    // Preserve the old route while replacing its former unconditional success with real verification.
    app.patch("/connections/:id/sync", schema("Verify an existing connection"), controller.reconnect.bind(controller));
    app.delete("/connections/:id", schema("Disconnect and delete a workspace connection"), controller.delete.bind(controller));
};

