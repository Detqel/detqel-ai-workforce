import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { AuthController } from "../controllers/auth.controller.js";
export const authRoutes: FastifyPluginAsync = async (app) => {
    const controller = new AuthController(app.services.auth);
    app.get("/auth/check-user", {
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "Check if a user account already exists by email or username",
        },
    }, controller.checkUser.bind(controller));
    app.post("/auth/login", {
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "Authenticate user and fetch active workspaces",
        },
    }, controller.login.bind(controller));
    app.post("/auth/register", {
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "Register new user account or log in existing user if credentials match",
        },
    }, controller.register.bind(controller));
    app.get("/auth/me", {
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "Get current user profile and workspaces",
        },
    }, controller.me.bind(controller));
};
