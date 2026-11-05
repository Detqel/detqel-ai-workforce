import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../../../shared/security/request-context.js";
import { createRouteGuards, workspaceFromParams } from "../../../shared/security/workspace-guard.js";
import { WorkspaceController } from "../controllers/workspace.controller.js";
export const workspaceRoutes: FastifyPluginAsync = async (app) => {
    const workspaceController = new WorkspaceController(app.services.workspaces);
    const guards = createRouteGuards(app);
    const workspaceParam = workspaceFromParams("id");
    const read = guards.workspace("read", workspaceParam);
    const manage = guards.workspace("manage", workspaceParam);
    const owner = guards.workspace("owner", workspaceParam);
    // Only an owner may create another owner.
    const grantOwnerRequiresOwner = async (request: Parameters<typeof read>[0]) => {
        const { role } = z.object({ role: z.string().optional() }).passthrough().parse(request.body ?? {});
        if (role === "owner") await app.services.workspaceAccess.authorize(requireUserId(request), await workspaceParam(request), "owner");
    };
    // List the signed-in user's workspaces
    app.get("/workspaces", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "List the signed-in user's workspaces",
        },
    }, workspaceController.listAll.bind(workspaceController));
    // List workspaces for a specific user (only the signed-in user's own)
    app.get("/workspaces/user/:userId", {
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "List all workspaces belonging to the signed-in user",
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
        preHandler: read,
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Get workspace details",
        },
    }, workspaceController.getOverview.bind(workspaceController));
    // Update workspace
    app.put("/workspaces/:id", {
        preHandler: manage,
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Update workspace details (name, domain/industry, description)",
        },
    }, workspaceController.update.bind(workspaceController));
    app.patch("/workspaces/:id", {
        preHandler: manage,
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Partially update workspace details",
        },
    }, workspaceController.update.bind(workspaceController));
    // Delete workspace
    app.delete("/workspaces/:id", {
        preHandler: owner,
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Permanently delete a workspace and its associated entities",
        },
    }, workspaceController.delete.bind(workspaceController));
    // List members
    app.get("/workspaces/:id/members", {
        preHandler: read,
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "List workspace members",
        },
    }, workspaceController.getMembers.bind(workspaceController));
    // Add member
    app.post("/workspaces/:id/members", {
        preHandler: [manage, grantOwnerRequiresOwner],
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Add member to workspace",
        },
    }, workspaceController.addMember.bind(workspaceController));
    // Remove member
    app.delete("/workspaces/:id/members/:userId", {
        preHandler: manage,
        schema: {
            tags: [API_TAG_NAMES.workspaces],
            summary: "Remove member from workspace",
        },
    }, workspaceController.removeMember.bind(workspaceController));
};
