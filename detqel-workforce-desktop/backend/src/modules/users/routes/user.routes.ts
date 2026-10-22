import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { UserController } from "../controllers/user.controller.js";
export const userRoutes: FastifyPluginAsync = async (app) => {
    const controller = new UserController(app.services.users);
    app.get("/users", {
        schema: {
            tags: [API_TAG_NAMES.users],
            summary: "List all users",
        },
    }, controller.list.bind(controller));
    app.post("/users", {
        schema: {
            tags: [API_TAG_NAMES.users],
            summary: "Register new user",
        },
    }, controller.create.bind(controller));
    app.get("/users/:id", {
        schema: {
            tags: [API_TAG_NAMES.users],
            summary: "Get user profile and workspace memberships",
        },
    }, controller.getById.bind(controller));
};
