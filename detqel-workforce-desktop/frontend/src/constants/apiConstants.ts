export const API_LOCAL_HOST = "127.0.0.1";
export const API_LOCAL_PORT = 8100;
export const API_LOCAL_BASE_URL = `http://${API_LOCAL_HOST}:${API_LOCAL_PORT}`;
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || API_LOCAL_BASE_URL;

export const API_PATHS = {
  prefix: "/api/",
  authCheckUser: "/api/auth/check-user",
  authLogin: "/api/auth/login",
  authRegister: "/api/auth/register",
  workspaces: "/api/workspaces",
  userWorkspaces: "/api/workspaces/user",
  domains: "/api/domains",
  activityHeatmap: "/api/analytics/activity-heatmap",
  notifications: "/api/notifications",
  markNotificationsRead: "/api/notifications/mark-all-read",
  aiProviders: "/api/settings/providers",
  testAIConnection: "/api/settings/test-connection",
  agentSettings: "/api/settings/vyra",
  testAgentPrompt: "/api/settings/vyra/test-prompt",
  connections: "/api/connections",
  connectorCatalog: "/api/connector-catalog",
  lookups: "/api/lookups",
} as const;

export const LOOKUP_RESOURCES = { root: "lookups", connectorTypes: "connector-types" } as const;

export const API_ACTIONS = {
  providerModels: "models",
  notificationRead: "read",
  verifyConnection: "test",
  reconnect: "reconnect",
  disconnect: "disconnect",
} as const;
