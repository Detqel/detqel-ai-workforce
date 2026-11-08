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

    app.patch("/discussions/workspaces/:workspaceId/sessions/:sessionId", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Rename a discussion" },
    }, controller.renameSession.bind(controller));

    app.post("/discussions/workspaces/:workspaceId/sessions/:sessionId/messages/:messageId/export", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Export an agent reply as Markdown, Word, or PDF and keep it in the session's artifacts" },
    }, controller.exportMessage.bind(controller));

    app.get("/discussions/workspaces/:workspaceId/sessions/:sessionId/artifacts", {
        preHandler: read,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "List the files kept in a discussion" },
    }, controller.listArtifacts.bind(controller));

    app.post("/discussions/workspaces/:workspaceId/sessions/:sessionId/artifacts", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Add a file to a discussion's artifacts" },
    }, controller.uploadArtifact.bind(controller));

    app.get("/discussions/workspaces/:workspaceId/sessions/:sessionId/artifacts/:fileName", {
        preHandler: read,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Download a file kept in a discussion" },
    }, controller.downloadArtifact.bind(controller));

    app.delete("/discussions/workspaces/:workspaceId/sessions/:sessionId/artifacts/:fileName", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Remove a file from a discussion's artifacts" },
    }, controller.deleteArtifact.bind(controller));

    app.post("/discussions/workspaces/:workspaceId/sessions/:sessionId/artifacts/:fileName/export", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Convert a Markdown document in a discussion's artifacts to Word or PDF" },
    }, controller.exportArtifact.bind(controller));

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
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Post a message and stream the turn that answers it as newline-delimited JSON events" },
    }, controller.postMessage.bind(controller));

    app.post("/discussions/workspaces/:workspaceId/sessions/:sessionId/turns/continue", {
        preHandler: write,
        schema: { tags: [API_TAG_NAMES.discussions], summary: "Stream the rest of a turn the user left before every agent replied" },
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
