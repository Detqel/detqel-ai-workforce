export const AUTH_STORAGE_KEYS = {
  accessToken: "detqel_access_token",
  user: "detqel_user",
  workspaces: "detqel_workspaces",
  currentWorkspace: "detqel_current_workspace",
} as const;

// Account rules enforced by the DETQEL License Portal, checked here first for immediate feedback.
export const MIN_USERNAME_LENGTH = 3;
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
export const MIN_PASSWORD_LENGTH = 12;
export const PHONE_DIGITS = { minimum: 6, maximum: 15 } as const;


// Display name shown before the signed-in user's profile has loaded.
export const LEGACY_DEMO_ACCOUNT = {
  name: "DETQEL Admin",
} as const;
