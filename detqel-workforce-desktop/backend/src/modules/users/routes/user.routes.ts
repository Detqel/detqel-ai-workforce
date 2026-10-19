import type { FastifyPluginAsync } from "fastify";
import { UserController } from "../controllers/user.controller.js";
export const userRoutes: FastifyPluginAsync = async (app) => {
    const controller = new UserController(app.services.users);
    app.get("/users", {
        schema: {
            tags: ["Users"],
            summary: "List all users",
        },
    }, controller.list.bind(controller));
    app.post("/users", {
        schema: {
            tags: ["Users"],
            summary: "Register new user",
        },
    }, controller.create.bind(controller));
    app.get("/users/:id", {
        schema: {
            tags: ["Users"],
            summary: "Get user profile and workspace memberships",
        },
    }, controller.getById.bind(controller));
};
