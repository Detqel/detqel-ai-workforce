export const AUTH_STORAGE_KEYS = {
  accessToken: "detqel_access_token",
  user: "detqel_user",
  workspaces: "detqel_workspaces",
  currentWorkspace: "detqel_current_workspace",
} as const;

export const MIN_USERNAME_LENGTH = 3;
export const MIN_PASSWORD_LENGTH = 6;

// Preserved existing development account behavior; this is not an API credential.
export const LEGACY_DEMO_ACCOUNT = {
  username: "admin",
  password: "admin",
  email: "admin@detqel.ai",
  userId: "user-admin-default",
  name: "DETQEL Admin",
  workspaceId: "ws-acme-default",
  workspaceName: "ACME Retail",
  workspaceSlug: "acme-retail",
  workspaceIndustry: "Retail & E-Commerce",
  role: "owner",
  status: "active",
} as const;
