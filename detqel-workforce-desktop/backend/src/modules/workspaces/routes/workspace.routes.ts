import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import { FastifyPluginAsync } from "fastify";
import { WorkspaceController } from "../controllers/workspace.controller.js";
export const workspaceRoutes: FastifyPluginAsync = async (app) => {
    const workspaceController = new WorkspaceController(app.services.workspaces);
    // List all workspaces
    app.get("/workspaces", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "List all workspaces",
        },
    }, workspaceController.listAll.bind(workspaceController));
    // List workspaces for a specific user
    app.get("/workspaces/user/:userId", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "List all workspaces belonging to a user",
        },
    }, workspaceController.listByUser.bind(workspaceController));
    // Create new workspace
    app.post("/workspaces", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Create a new workspace and assign owner",
        },
    }, workspaceController.create.bind(workspaceController));
    // Get workspace details and members
    app.get("/workspaces/:id", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Get workspace details",
        },
    }, workspaceController.getOverview.bind(workspaceController));
    // Update workspace
    app.put("/workspaces/:id", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Update workspace details (name, domain/industry, description)",
        },
    }, workspaceController.update.bind(workspaceController));
    app.patch("/workspaces/:id", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Partially update workspace details",
        },
    }, workspaceController.update.bind(workspaceController));
    // Delete workspace
    app.delete("/workspaces/:id", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Permanently delete a workspace and its associated entities",
        },
    }, workspaceController.delete.bind(workspaceController));
    // List members
    app.get("/workspaces/:id/members", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "List workspace members",
        },
    }, workspaceController.getMembers.bind(workspaceController));
    // Add member
    app.post("/workspaces/:id/members", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Add member to workspace",
        },
    }, workspaceController.addMember.bind(workspaceController));
    // Remove member
    app.delete("/workspaces/:id/members/:userId", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Remove member from workspace",
        },
    }, workspaceController.removeMember.bind(workspaceController));
};
