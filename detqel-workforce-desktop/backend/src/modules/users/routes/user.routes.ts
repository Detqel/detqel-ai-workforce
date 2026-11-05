import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { createRouteGuards } from "../../../shared/security/workspace-guard.js";
import { UserController } from "../controllers/user.controller.js";
export const userRoutes: FastifyPluginAsync = async (app) => {
    const controller = new UserController(app.services.users);
    const guards = createRouteGuards(app);
    app.get("/users", {
        schema: {
            tags: [API_TAG_NAMES.users],
            summary: "List people who share a workspace with the signed-in user",
        },
    }, controller.list.bind(controller));
    app.post("/users", {
        preHandler: guards.administrator(),
        schema: {
            tags: [API_TAG_NAMES.users],
            summary: "Create a user profile (administrators only)",
        },
    }, controller.create.bind(controller));
    app.get("/users/:id", {
        schema: {
            tags: [API_TAG_NAMES.users],
            summary: "Get a user profile. Workspace memberships are included only for the signed-in user",
        },
    }, controller.getById.bind(controller));
};
