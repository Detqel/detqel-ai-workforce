import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fastify, { FastifyInstance, LogController } from "fastify";
import { ZodError } from "zod";
import { createServices, type ApplicationServices } from "./bootstrap/services.js";
import { env, type Environment } from "./config/env.js";
import {
    API_DOCS_PREFIX,
    API_PREFIX,
    CORS_METHODS,
    LOG_REDACTION_PATHS,
    OPENAPI_INFO,
    OPENAPI_SERVER_DESCRIPTION,
    OPENAPI_TAGS,
} from "./constants/apiConstants.js";
import { DATABASE_ERROR_CODES } from "./constants/databaseConstants.js";
import { LOCALHOST_HOST } from "./constants/networkConstants.js";
import { LOG_LEVELS } from "./constants/loggingConstants.js";
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
import { registerDesktopTransport } from "./shared/security/desktop-transport.js";
export interface BuildAppOptions {
    desktopToken?: string;
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
            level: config.NODE_ENV === "development" ? LOG_LEVELS.development : LOG_LEVELS.production,
            stream: createLogStream(),
            redact: LOG_REDACTION_PATHS,
        },
    });
    if (options.desktopToken) registerDesktopTransport(app, options.desktopToken);
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
            methods: CORS_METHODS,
            credentials: true,
        });
        await app.register(sensible);
        // OpenAPI Swagger Documentation
        await app.register(swagger, {
            openapi: {
                info: OPENAPI_INFO,
                servers: [
                    {
                        url: `http://${LOCALHOST_HOST}:${config.PORT}`,
                        description: OPENAPI_SERVER_DESCRIPTION,
                    },
                ],
                tags: OPENAPI_TAGS,
            },
        });
        await app.register(swaggerUi, {
            routePrefix: API_DOCS_PREFIX,
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
            const statusCode = databaseCode === DATABASE_ERROR_CODES.uniqueViolation ? 409 : databaseCode === DATABASE_ERROR_CODES.foreignKeyViolation ? 400 : err.statusCode || 500;
            request.log.error({ err: error, requestId: request.id }, "Request failed");
            return reply.status(statusCode).send({
                statusCode,
                error: statusCode >= 500 ? "Internal Server Error" : err.name || "Request Error",
                message: statusCode >= 500 ? "An unexpected error occurred" : databaseCode === DATABASE_ERROR_CODES.uniqueViolation ? "A record with these values already exists" : databaseCode === DATABASE_ERROR_CODES.foreignKeyViolation ? "A referenced record does not exist" : err.message,
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
        }, { prefix: API_PREFIX });
        return app;
    }
    catch (error) {
        await app.close();
        throw error;
    }
}
