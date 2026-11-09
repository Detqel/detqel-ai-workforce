import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { AuthController } from "../controllers/auth.controller.js";
export const authRoutes: FastifyPluginAsync = async (app) => {
    const controller = new AuthController(app.services.auth);
    // These three routes are the only ones reachable without a session.
    const publicRoute = { public: true };
    app.get("/auth/license-options", {
        config: publicRoute,
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "List the licenses the DETQEL License Portal offers for KIN registration",
        },
    }, controller.licenseOptions.bind(controller));
    app.post("/auth/login", {
        config: publicRoute,
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "Sign in through the DETQEL License Portal with a username and password",
        },
    }, controller.login.bind(controller));
    app.post("/auth/register", {
        config: publicRoute,
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "Register a DETQEL account and request a KIN license from the License Portal",
        },
    }, controller.register.bind(controller));
    app.get("/auth/me", {
        schema: {
            tags: [API_TAG_NAMES.auth],
            summary: "Get the signed-in user's profile and workspaces, with a renewed session token",
        },
    }, controller.me.bind(controller));
};
