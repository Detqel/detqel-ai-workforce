import { FastifyPluginAsync } from "fastify";
import { DomainController } from "../controllers/domain.controller.js";
export const domainRoutes: FastifyPluginAsync = async (app) => {
    const domainController = new DomainController(app.services.domains);
    // List all industry domains from database
    app.get("/domains", {
        schema: {
            tags: ["Domains"],
            summary: "List all industry domains stored in the database",
        },
    }, domainController.listAll.bind(domainController));
    // Store a domain in the database
    app.post("/domains", {
        schema: {
            tags: ["Domains"],
            summary: "Store an industry domain in the database",
        },
    }, domainController.create.bind(domainController));
};
