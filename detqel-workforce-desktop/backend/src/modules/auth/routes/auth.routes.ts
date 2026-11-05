import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { AuthController } from "../controllers/auth.controller.js";
export const authRoutes: FastifyPluginAsync = async (app) => {
    const controller = new AuthController(app.services.auth);
    // These three routes are the only ones reachable without a session.
    const publicRoute = { public: true };
    app.get("/auth/check-user", {
        config: publicRoute,
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "Check if a user account already exists by email or username",
        },
    }, controller.checkUser.bind(controller));
    app.post("/auth/login", {
        config: publicRoute,
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "Authenticate user and fetch active workspaces",
        },
    }, controller.login.bind(controller));
    app.post("/auth/register", {
        config: publicRoute,
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "Register new user account or log in existing user if credentials match",
        },
    }, controller.register.bind(controller));
    app.get("/auth/me", {
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "Get the signed-in user's profile and workspaces, with a renewed session token",
        },
    }, controller.me.bind(controller));
};
