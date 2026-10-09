export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  avatarUrl?: string | null;
  status: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  industry?: string | null;
  description?: string | null;
  timezone?: string | null;
  logoUrl?: string | null;
  role?: string;
  status?: string;
}

export interface AuthResponse {
  user: UserProfile;
  workspaces: WorkspaceSummary[];
  hasWorkspace: boolean;
  isExistingUser?: boolean;
}

export interface CheckUserResponse {
  exists: boolean;
  hasWorkspace: boolean;
  emailMatch?: boolean;
  usernameMatch?: boolean;
  workspaceCount?: number;
  user?: {
    id: string;
    name: string;
    email: string;
    username: string | null;
  };
}

/**
 * Check if a user account already exists by email or username
 */
export async function apiCheckUser(params: {
  email?: string;
  username?: string;
}): Promise<CheckUserResponse> {
  const query = new URLSearchParams();
  if (params.email?.trim()) query.set("email", params.email.trim());
  if (params.username?.trim()) query.set("username", params.username.trim());

  if (!params.email?.trim() && !params.username?.trim()) {
    return { exists: false, hasWorkspace: false };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/check-user?${query.toString()}`);
    if (!res.ok) {
      return { exists: false, hasWorkspace: false };
    }
    return res.json();
  } catch {
    return { exists: false, hasWorkspace: false };
  }
}

/**
 * Authenticate with the DETQEL API backend
 */
export async function apiLogin(payload: {
  identifier: string;
  password: string;
  companyName?: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Failed to authenticate with DETQEL API");
  }

  return data;
}

/**
 * Register a new user account
 */
export async function apiRegister(payload: {
  name: string;
  email: string;
  username?: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Failed to create account with DETQEL API");
  }

  return data;
}

/**
 * Fetch workspaces belonging to a user
 */
export async function apiGetUserWorkspaces(
  userId: string
): Promise<WorkspaceSummary[]> {
  const res = await fetch(`${API_BASE_URL}/api/workspaces/user/${userId}`);
  if (!res.ok) {
    throw new Error("Failed to retrieve user workspaces");
  }
  return res.json();
}

/**
 * Create a new workspace and assign user as owner
 */
export async function apiCreateWorkspace(payload: {
  name: string;
  slug?: string;
  industry?: string;
  description?: string;
  createdBy: string;
}): Promise<WorkspaceSummary> {
  const res = await fetch(`${API_BASE_URL}/api/workspaces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Failed to create workspace");
  }

  return data;
}

/**
 * Permanently delete a workspace by ID
 */
export async function apiDeleteWorkspace(workspaceId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/api/workspaces/${workspaceId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to delete workspace");
  }
  return true;
}

/**
 * Update workspace name, domain/industry, and description
 */
export async function apiUpdateWorkspace(
  workspaceId: string,
  payload: {
    name?: string;
    industry?: string;
    description?: string;
  }
): Promise<WorkspaceSummary> {
  const res = await fetch(`${API_BASE_URL}/api/workspaces/${workspaceId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Failed to update workspace");
  }

  return data;
}

export interface IndustryDomainItem {
  id: string;
  name: string;
  description?: string | null;
  isCustom?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Fetch all industry domains dynamically from database
 */
export async function apiGetDomains(): Promise<IndustryDomainItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/domains`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to retrieve industry domains");
  }
  return res.json();
}

/**
 * Store a custom industry domain in the database
 */
export async function apiCreateDomain(name: string): Promise<IndustryDomainItem> {
  const res = await fetch(`${API_BASE_URL}/api/domains`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to create industry domain");
  }
  return res.json();
}

export interface ActivityHeatmapDayCell {
  date: string;
  formattedDate: string;
  count: number;
  level: number;
}

export interface ActivityHeatmapResponse {
  categories: string[];
  milestoneDates: string[];
  totalActivities: number;
  days: string[];
  matrix: Record<string, ActivityHeatmapDayCell[]>;
}

/**
 * Fetch 4-week activity heatmap directly aggregated from database
 */
export async function apiGetActivityHeatmap(params: {
  workspaceId: string;
  userId?: string;
  days?: number;
}): Promise<ActivityHeatmapResponse | null> {
  try {
    const query = new URLSearchParams();
    query.set("workspaceId", params.workspaceId);
    if (params.userId) query.set("userId", params.userId);
    if (params.days) query.set("days", params.days.toString());

    const res = await fetch(
      `${API_BASE_URL}/api/analytics/activity-heatmap?${query.toString()}`
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export interface UserNotification {
  id: string;
  userId: string;
  workspaceId?: string | null;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "alert";
  isRead: boolean;
  link?: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: UserNotification[];
  unreadCount: number;
}

/**
 * Fetch notifications dynamically for a specific user from the database
 */
export async function apiGetUserNotifications(params: {
  userId: string;
  workspaceId?: string;
  unreadOnly?: boolean;
}): Promise<NotificationsResponse> {
  try {
    const query = new URLSearchParams();
    query.set("userId", params.userId);
    if (params.workspaceId) query.set("workspaceId", params.workspaceId);
    if (params.unreadOnly) query.set("unreadOnly", "true");

    const res = await fetch(`${API_BASE_URL}/api/notifications?${query.toString()}`);
    if (!res.ok) {
      return { notifications: [], unreadCount: 0 };
    }
    return res.json();
  } catch {
    return { notifications: [], unreadCount: 0 };
  }
}

/**
 * Mark a single notification as read
 */
export async function apiMarkNotificationRead(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, {
      method: "PATCH",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function apiMarkAllNotificationsRead(params: {
  userId: string;
  workspaceId?: string;
}): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/notifications/mark-all-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.ok;
  } catch {
    return false;
  }
}

