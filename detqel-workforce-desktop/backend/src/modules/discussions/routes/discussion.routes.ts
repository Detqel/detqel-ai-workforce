import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { createRouteGuards, workspaceFromBody, workspaceFromParams } from "../../../shared/security/workspace-guard.js";
import { DiscussionController } from "../controllers/discussion.controller.js";

export const discussionRoutes: FastifyPluginAsync = async (app) => {
    const controller = new DiscussionController(app.services.discussions);
    const guards = createRouteGuards(app);
    const read = guards.workspace("read", workspaceFromParams());
    const write = guards.workspace("write", workspaceFromParams());
    // Creating a session names its workspace in the body.
    const createWrite = guards.workspace("write", workspaceFromBody());

    app.post("/discussions/sessions", {
        preHandler: createWrite,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Create a discussion session" },
    }, controller.createSession.bind(controller));

    app.get("/discussions/workspaces/:workspaceId/sessions", {
        preHandler: read,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "List discussion sessions" },
    }, controller.listSessions.bind(controller));

    app.get("/discussions/workspaces/:workspaceId/sessions/:sessionId", {
        preHandler: read,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Get a discussion session" },
    }, controller.getSession.bind(controller));

    app.delete("/discussions/workspaces/:workspaceId/sessions/:sessionId", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Delete a session and all its artifacts" },
    }, controller.deleteSession.bind(controller));

    app.get("/discussions/workspaces/:workspaceId/sessions/:sessionId/messages", {
        preHandler: read,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "List session messages" },
    }, controller.listMessages.bind(controller));

    app.post("/discussions/workspaces/:workspaceId/sessions/:sessionId/messages", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Post a message and receive an agent reply" },
    }, controller.postMessage.bind(controller));

    app.post("/discussions/workspaces/:workspaceId/sessions/:sessionId/turns/continue", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Let the next queued teammate reply in the current turn" },
    }, controller.continueTurn.bind(controller));

    app.get("/discussions/workspaces/:workspaceId/sessions/:sessionId/connectors", {
        preHandler: read,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "List connectors attached to a session" },
    }, controller.listConnectors.bind(controller));

    app.post("/discussions/workspaces/:workspaceId/sessions/:sessionId/connectors", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Attach a connector to a session" },
    }, controller.attachConnector.bind(controller));

    app.delete("/discussions/workspaces/:workspaceId/sessions/:sessionId/connectors/:connectionId", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Detach a connector from a session" },
    }, controller.detachConnector.bind(controller));

    app.post("/discussions/workspaces/:workspaceId/sessions/:sessionId/knowledge", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Upload and ingest a session knowledge file" },
    }, controller.addKnowledge.bind(controller));
};
