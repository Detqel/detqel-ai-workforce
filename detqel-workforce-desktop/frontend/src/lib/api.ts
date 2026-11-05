import { API_BASE_URL, API_PATHS, API_ACTIONS } from "@/constants/apiConstants";
import { desktopFetch } from "./desktop";
import { authorizedFetch, storeAccessToken } from "./auth-session";
export { refreshSession as apiRefreshSession } from "./auth-session";
export { API_BASE_URL } from "@/constants/apiConstants";

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
  accessToken: string;
  expiresAt: string;
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
    const res = await desktopFetch(`${API_BASE_URL}${API_PATHS.authCheckUser}?${query.toString()}`);
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
  const res = await desktopFetch(`${API_BASE_URL}${API_PATHS.authLogin}`, {
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

  storeAccessToken(data.accessToken);
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
  const res = await desktopFetch(`${API_BASE_URL}${API_PATHS.authRegister}`, {
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

  storeAccessToken(data.accessToken);
  return data;
}

/**
 * Fetch workspaces belonging to a user
 */
export async function apiGetUserWorkspaces(
  userId: string
): Promise<WorkspaceSummary[]> {
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.userWorkspaces}/${userId}`);
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
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.workspaces}`, {
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
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.workspaces}/${workspaceId}`, {
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
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.workspaces}/${workspaceId}`, {
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
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.domains}`);
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
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.domains}`, {
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

    const res = await authorizedFetch(
      `${API_BASE_URL}${API_PATHS.activityHeatmap}?${query.toString()}`
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

    const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.notifications}?${query.toString()}`);
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
    const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.notifications}/${id}/${API_ACTIONS.notificationRead}`, {
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
    const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.markNotificationsRead}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface AIProviderModel {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  iconKey: string;
  description?: string | null;
  badge?: string | null;
  models: AIProviderModel[];
  apiKey?: string | null;
  status: string;
  isConnected: boolean;
  sortOrder: number;
}

export interface VyraInstructions {
  core: string;
  behaviour: string;
  knowledge: string;
  boundaries: string;
  responseStyle: string;
}

export interface VyraTemplate {
  id: string;
  name: string;
  description?: string;
  instructions: VyraInstructions;
}

export interface SamplePrompt {
  id: string;
  title: string;
  prompt: string;
}

export interface AgentTrait {
  title: string;
  description: string;
  icon: string;
}

export interface VyraSettings {
  id: string;
  workspaceId?: string | null;
  agentName: string;
  slogan: string;
  quote: string;
  selectedProviderId: string;
  selectedModelId: string;
  apiKey?: string | null;
  keyStatus: string;
  isValidKey: boolean;
  instructions: VyraInstructions;
  templates: VyraTemplate[];
  samplePrompts: SamplePrompt[];
  traits: AgentTrait[];
  previewMode: string;
}

export async function apiGetAIProviders(): Promise<AIProvider[]> {
  try {
    const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.aiProviders}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.providers || [];
  } catch {
    return [];
  }
}

export async function apiGetProviderModels(
  providerId: string,
  apiKey?: string
): Promise<AIProviderModel[]> {
  if (!providerId) return [];
  try {
    const query = apiKey?.trim() ? `?apiKey=${encodeURIComponent(apiKey.trim())}` : "";
    const res = await authorizedFetch(
      `${API_BASE_URL}${API_PATHS.aiProviders}/${encodeURIComponent(providerId)}/${API_ACTIONS.providerModels}${query}`
    );
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    if (Array.isArray(data.models)) {
      return data.models;
    }
    return [];
  } catch {
    return [];
  }
}

export async function apiUpdateAIProvider(
  id: string,
  updates: Partial<AIProvider>
): Promise<AIProvider | null> {
  try {
    const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.aiProviders}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.provider || null;
  } catch {
    return null;
  }
}

export async function apiTestConnection(params: {
  providerId: string;
  apiKey?: string;
  modelId?: string;
}): Promise<{
  success: boolean;
  status: string;
  message: string;
  latencyMs: number;
}> {
  try {
    const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.testAIConnection}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      return {
        success: false,
        status: "error",
        message: "Network error during connection test",
        latencyMs: 0,
      };
    }
    return res.json();
  } catch {
    return {
      success: false,
      status: "error",
      message: "Connection test request failed",
      latencyMs: 0,
    };
  }
}

export async function apiGetVyraSettings(workspaceId?: string): Promise<VyraSettings | null> {
  try {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.agentSettings}${query}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.settings || null;
  } catch {
    return null;
  }
}

export async function apiUpdateVyraSettings(
  workspaceId: string | undefined,
  updates: Partial<VyraSettings>
): Promise<VyraSettings | null> {
  try {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.agentSettings}${query}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.settings || null;
  } catch {
    return null;
  }
}

export async function apiTestVyraPrompt(params: {
  prompt: string;
  providerId?: string;
  modelId?: string;
  apiKey?: string;
  mode?: "chat" | "structured";
  systemPrompt?: string;
}): Promise<{
  success: boolean;
  output: string;
  structuredOutput?: Record<string, unknown>;
  tokensUsed: number;
  latencyMs: number;
  timestamp: string;
}> {
  try {
    const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.testAgentPrompt}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || "Failed to test prompt");
    }
    return res.json();
  } catch (error: any) {
    return {
      success: false,
      output: `Error testing prompt: ${error?.message || "Failed to connect to agent"}`,
      tokensUsed: 0,
      latencyMs: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

export interface AgentRecord {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string;
  purpose: string;
  instructions: string;
  agentType: "platform" | "custom" | "marketplace";
  scope: Record<string, unknown>;
  capabilities: string[];
  approvalPolicy: Record<string, unknown>;
  status: "active" | "draft" | "paused" | "archived";
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentPayload {
  workspaceId?: string;
  name: string;
  description: string;
  purpose: string;
  instructions: string;
  agentType?: "platform" | "custom" | "marketplace";
  scope?: Record<string, unknown>;
  capabilities?: unknown[];
  approvalPolicy?: Record<string, unknown>;
  createdBy?: string;
}

export async function apiGetAgents(workspaceId?: string): Promise<AgentRecord[]> {
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.agents}${query}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to load agents");
  }
  return res.json();
}

export async function apiCreateAgent(payload: CreateAgentPayload): Promise<AgentRecord> {
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.agents}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to create agent");
  }
  return res.json();
}

export interface RecruitSection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  displayOrder: number;
  isActive: boolean;
  templateCount?: number;
}

export interface RecruitTemplate {
  id: string;
  sectionId: string;
  name: string;
  role: string;
  slug: string;
  levelId: string;
  statusId: string;
  summary: string | null;
  description: string | null;
  avatarUrl: string | null;
  isFeatured: boolean;
  isUserCreated?: boolean;
  currentVersion: string;
  section?: RecruitSection | null;
  level?: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    rank: number;
  } | null;
  latestVersion?: {
    id: string;
    templateId: string;
    version: string;
    systemPrompt: string | null;
    instructionTemplate: string | null;
    configurationSchema: Record<string, unknown>;
  } | null;
}

export interface RecruitedAgent {
  id: string;
  organizationId: string;
  workspaceId: string;
  templateId: string | null;
  templateVersionId: string | null;
  customName: string | null;
  customRole: string | null;
  systemPrompt: string | null;
  customInstructions: string | null;
  configuration: Record<string, unknown>;
  status: string;
  isUserCreated?: boolean;
  recruitedAt: string;
  recruitedBy?: string | null;
  template?: RecruitTemplate | null;
  teams?: {
    teamId: string;
    teamName: string;
    memberRole: string;
    isLead: boolean;
    accentColor: string;
  }[];
}

export interface RecruitAgentPayload {
  workspaceId: string;
  templateId: string;
  customName?: string;
  customRole?: string;
  customInstructions?: string;
  userId?: string;
}

export interface CreateCustomAgentPayload {
  workspaceId: string;
  name: string;
  role: string;
  sectionId: string;
  levelId?: string;
  summary?: string;
  description?: string;
  systemPrompt?: string;
  capabilities?: string[];
  userId?: string;
}

export async function apiCreateCustomAgent(payload: CreateCustomAgentPayload): Promise<RecruitedAgent> {
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.agents}/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err.issues?.[0]?.message || err.message || "Failed to create custom agent";
    throw new Error(message);
  }
  return res.json();
}

export async function apiGetRecruitSections(): Promise<RecruitSection[]> {
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.agentSections}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to load agent marketplace sections");
  }
  return res.json();
}

export async function apiGetRecruitTemplates(params?: {
  section?: string;
  level?: string;
  search?: string;
  limit?: number;
}): Promise<RecruitTemplate[]> {
  const searchParams = new URLSearchParams();
  if (params?.section && params.section !== "all") searchParams.set("section", params.section);
  if (params?.level && params.level !== "all") searchParams.set("level", params.level);
  if (params?.search?.trim()) searchParams.set("search", params.search.trim());
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.agentTemplates}${query}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to load agent templates");
  }
  return res.json();
}

export async function apiRecruitAgent(payload: RecruitAgentPayload): Promise<RecruitedAgent> {
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.agentRecruit}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to recruit agent");
  }
  return res.json();
}

export async function apiGetRecruitedAgents(workspaceId: string): Promise<RecruitedAgent[]> {
  const res = await authorizedFetch(
    `${API_BASE_URL}${API_PATHS.agentRecruited}?workspaceId=${encodeURIComponent(workspaceId)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to load recruited agents");
  }
  return res.json();
}

export interface AgentTeamMember {
  id: string;
  teamId: string;
  agentId: string;
  memberRole: string;
  isLead: boolean;
  assignedBy?: string | null;
  joinedAt: string;
  agent: RecruitedAgent;
}

export interface AgentTeam {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  focus: string;
  icon: string;
  accentColor: string;
  status: string;
  missionObjective: string | null;
  settings: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  members: AgentTeamMember[];
  memberCount: number;
  lead?: AgentTeamMember | null;
}

export interface CreateTeamPayload {
  workspaceId: string;
  name: string;
  description?: string;
  focus?: string;
  icon?: string;
  accentColor?: string;
  missionObjective?: string;
  memberAgentIds?: string[];
  leadAgentId?: string;
  userId?: string;
}

export interface UpdateTeamPayload {
  name?: string;
  description?: string;
  focus?: string;
  icon?: string;
  accentColor?: string;
  missionObjective?: string;
  status?: string;
}

export async function apiGetTeams(workspaceId: string): Promise<AgentTeam[]> {
  const res = await authorizedFetch(
    `${API_BASE_URL}${API_PATHS.teams}?workspaceId=${encodeURIComponent(workspaceId)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to load teams");
  }
  return res.json();
}

export async function apiGetTeam(id: string, workspaceId: string): Promise<AgentTeam> {
  const res = await authorizedFetch(
    `${API_BASE_URL}${API_PATHS.teams}/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to get team");
  }
  return res.json();
}

export async function apiCreateTeam(payload: CreateTeamPayload): Promise<AgentTeam> {
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.teams}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err.issues?.[0]?.message || err.message || "Failed to create team";
    throw new Error(message);
  }
  return res.json();
}

export async function apiUpdateTeam(id: string, workspaceId: string, payload: UpdateTeamPayload): Promise<AgentTeam> {
  const res = await authorizedFetch(
    `${API_BASE_URL}${API_PATHS.teams}/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to update team");
  }
  return res.json();
}

export async function apiDeleteTeam(id: string, workspaceId: string): Promise<boolean> {
  const res = await authorizedFetch(
    `${API_BASE_URL}${API_PATHS.teams}/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to delete team");
  }
  const data = await res.json().catch(() => ({ success: true }));
  return Boolean(data.success);
}

export async function apiAddTeamMember(teamId: string, payload: { agentId: string; memberRole?: string; isLead?: boolean; userId?: string }): Promise<void> {
  const res = await authorizedFetch(`${API_BASE_URL}${API_PATHS.teams}/${encodeURIComponent(teamId)}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to add team member");
  }
}

export async function apiRemoveTeamMember(teamId: string, agentId: string): Promise<void> {
  const res = await authorizedFetch(
    `${API_BASE_URL}${API_PATHS.teams}/${encodeURIComponent(teamId)}/members/${encodeURIComponent(agentId)}`,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to remove team member");
  }
}





