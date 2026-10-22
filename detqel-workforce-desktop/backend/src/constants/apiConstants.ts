import { APPLICATION_NAME } from "./commonConstants.js";
import { DESKTOP_TOKEN_HEADER } from "./authConstants.js";

export const API_PREFIX = "/api";
export const API_DOCS_PREFIX = "/docs";
export const CORS_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
export const LOG_REDACTION_PATHS = ["req.headers.authorization", "req.headers.cookie", `req.headers["${DESKTOP_TOKEN_HEADER}"]`, "password", "passwordHash"];
export const API_TAG_NAMES = {
    system: "System", auth: "Auth", workspaces: "Workspaces", users: "Users",
    business: "Business Brain", workforce: "AI Workforce", connections: "Connections", lookups: "Lookups",
    missions: "Missions & Command Center", approvals: "Approvals", executions: "Executions",
    analytics: "Analytics & Intelligence", automations: "Automations", notifications: "Notifications",
    domains: "Domains", settings: "Settings",
} as const;

export const OPENAPI_INFO = {
    title: `${APPLICATION_NAME} API`,
    description: "Enterprise Backend & Drizzle ORM Handler Layer for Autonomous AI Workforce Orchestration",
    version: "1.0.0",
};

export const OPENAPI_SERVER_DESCRIPTION = "Local Development Server";
export const OPENAPI_TAGS = [
    { name: API_TAG_NAMES.system, description: "Health check and telemetry" },
    { name: API_TAG_NAMES.workspaces, description: "Multi-tenant workspace operations" },
    { name: API_TAG_NAMES.users, description: "User accounts and permissions" },
    { name: API_TAG_NAMES.business, description: "Profile, Knowledge, Goals, Rules, State, and Memory" },
    { name: API_TAG_NAMES.workforce, description: "Agents, connections, and agent memory" },
    { name: API_TAG_NAMES.connections, description: "Data sources and external tool integrations" },
    { name: API_TAG_NAMES.lookups, description: "Common lookup table operations" },
    { name: API_TAG_NAMES.missions, description: "Mission lifecycles, plans, and event timelines" },
    { name: API_TAG_NAMES.approvals, description: "Human-in-the-loop governance and sign-off" },
    { name: API_TAG_NAMES.executions, description: "Action dispatching and execution status" },
    { name: API_TAG_NAMES.analytics, description: "Predictions and simulations" },
    { name: API_TAG_NAMES.automations, description: "Autonomous workflows and scheduled tasks" },
];
