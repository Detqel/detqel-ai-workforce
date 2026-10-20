import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastify, { FastifyInstance, LogController } from "fastify";
import { ZodError } from "zod";
import { createServices, type ApplicationServices } from "./bootstrap/services.js";
import { env, type Environment } from "./config/env.js";
import { createDatabase } from "./infrastructure/database/connection.js";
import { UnitOfWork } from "./infrastructure/database/unit-of-work.js";
import { verifyMigrationState } from "./infrastructure/database/migrations/verify.js";
import { analyticsRoutes } from "./modules/analytics/routes/analytics.routes.js";
import { approvalRoutes } from "./modules/approvals/routes/approval.routes.js";
import { authRoutes } from "./modules/auth/routes/auth.routes.js";
import { automationRoutes } from "./modules/automations/routes/automation.routes.js";
import { businessRoutes } from "./modules/business/routes/business.routes.js";
import { connectionRoutes } from "./modules/connections/routes/connection.routes.js";
import { domainRoutes } from "./modules/domains/routes/domain.routes.js";
import { executionRoutes } from "./modules/executions/routes/execution.routes.js";
import { healthRoutes } from "./modules/health/routes/health.routes.js";
import { missionRoutes } from "./modules/missions/routes/mission.routes.js";
import { notificationRoutes } from "./modules/notifications/routes/notification.routes.js";
import { userRoutes } from "./modules/users/routes/user.routes.js";
import { agentRoutes } from "./modules/workforce/routes/agent.routes.js";
import { workspaceRoutes } from "./modules/workspaces/routes/workspace.routes.js";
import { settingsRoutes } from "./modules/settings/routes/settings.routes.js";
import { lookupRoutes } from "./modules/lookups/routes/lookup.routes.js";
import { AppError } from "./shared/errors/app-error.js";
import { createLogStream } from "./shared/logging/logger.js";
export interface BuildAppOptions {
    config?: Environment;
    services?: ApplicationServices;
    close?: () => Promise<void>;
    logger?: boolean;
    verifyDatabase?: boolean;
}
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
    const config = options.config ?? env;
    const connection = options.services ? undefined : createDatabase(config);
    const app = fastify({
        // UI refreshes make several API calls; keep routine request logs quiet.
        logController: new LogController({ disableRequestLogging: true }),
        logger: options.logger === false ? false : {
            level: config.NODE_ENV === "development" ? "info" : "warn",
            stream: createLogStream(),
            redact: ["req.headers.authorization", "req.headers.cookie", "password", "passwordHash"],
        },
    });
    app.decorate("services", options.services ?? createServices(new UnitOfWork(connection!.db), connection!.check, config));
    app.addHook("onClose", async () => {
        await app.services.connections.close();
        await connection?.close();
        await options.close?.();
    });
    try {
        // Read-only startup validation: deployment owns schema changes.
        if (connection && options.verifyDatabase) await verifyMigrationState(connection.db);
        // Plugins
        const allowedOrigins = config.CORS_ORIGIN.split(",").map((o) => o.trim());
        await app.register(cors, {
            origin: (origin, cb) => {
                if (!origin)
                    return cb(null, true);
                if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
                    return cb(null, true);
                }
                return cb(null, false);
            },
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            credentials: true,
        });
        await app.register(sensible);
        // OpenAPI Swagger Documentation
        await app.register(swagger, {
            openapi: {
                info: {
                    title: "DETQEL AI Workforce API",
                    description: "Enterprise Backend & Drizzle ORM Handler Layer for Autonomous AI Workforce Orchestration",
                    version: "1.0.0",
                },
                servers: [
                    {
                        url: `http://localhost:${config.PORT}`,
                        description: "Local Development Server",
                    },
                ],
                tags: [
                    { name: "System", description: "Health check and telemetry" },
                    { name: "Workspaces", description: "Multi-tenant workspace operations" },
                    { name: "Users", description: "User accounts and permissions" },
                    { name: "Business Brain", description: "Profile, Knowledge, Goals, Rules, State, and Memory" },
                    { name: "AI Workforce", description: "Agents, connections, and agent memory" },
                    { name: "Connections", description: "Data sources and external tool integrations" },
                    { name: "Lookups", description: "Common lookup table operations" },
                    { name: "Missions & Command Center", description: "Mission lifecycles, plans, and event timelines" },
                    { name: "Approvals", description: "Human-in-the-loop governance and sign-off" },
                    { name: "Executions", description: "Action dispatching and execution status" },
                    { name: "Analytics & Intelligence", description: "Predictions and simulations" },
                    { name: "Automations", description: "Autonomous workflows and scheduled tasks" },
                ],
            },
        });
        await app.register(swaggerUi, {
            routePrefix: "/docs",
            uiConfig: {
                docExpansion: "list",
                deepLinking: true,
            },
        });
        // Custom Validation / Error Handler
        app.setErrorHandler((error, request, reply) => {
            if (error instanceof ZodError) {
                return reply.status(400).send({
                    statusCode: 400,
                    error: "Bad Request",
                    message: "Validation failed",
                    issues: error.issues.map((i) => ({
                        path: i.path.join("."),
                        message: i.message,
                    })),
                });
            }
            const err = error as {
                statusCode?: number;
                name?: string;
                message?: string;
                code?: string;
            };
            const databaseCode = err.code ?? (error as {
                cause?: {
                    code?: string;
                };
            }).cause?.code;
            const statusCode = databaseCode === "23505" ? 409 : databaseCode === "23503" ? 400 : err.statusCode || 500;
            request.log.error({ err: error, requestId: request.id }, "Request failed");
            return reply.status(statusCode).send({
                statusCode,
                error: statusCode >= 500 ? "Internal Server Error" : err.name || "Request Error",
                message: statusCode >= 500 ? "An unexpected error occurred" : databaseCode === "23505" ? "A record with these values already exists" : databaseCode === "23503" ? "A referenced record does not exist" : err.message,
                ...(error instanceof AppError ? error.details : {}),
            });
        });
        // Register Modules
        await app.register(healthRoutes);
        await app.register(async (apiRouter) => {
            await apiRouter.register(authRoutes);
            await apiRouter.register(workspaceRoutes);
            await apiRouter.register(userRoutes);
            await apiRouter.register(businessRoutes);
            await apiRouter.register(agentRoutes);
            await apiRouter.register(connectionRoutes);
            await apiRouter.register(lookupRoutes);
            await apiRouter.register(missionRoutes);
            await apiRouter.register(approvalRoutes);
            await apiRouter.register(executionRoutes);
            await apiRouter.register(analyticsRoutes);
            await apiRouter.register(automationRoutes);
            await apiRouter.register(notificationRoutes);
            await apiRouter.register(domainRoutes);
            await apiRouter.register(settingsRoutes);
        }, { prefix: "/api" });
        return app;
    }
    catch (error) {
        await app.close();
        throw error;
    }
}
