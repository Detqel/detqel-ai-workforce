import { API_BASE_URL, API_PATHS } from "@/constants/apiConstants";
import { authorizedFetch } from "@/lib/auth-session";

export type DiscussionScope = "conversations" | "teams";
export type ResponseMode = "brief" | "detailed";
export type CapabilityMode = "fast" | "expert";

/** Running gateway totals for a session, as reported by LiteLLM. */
export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
}

export interface ChatSession extends SessionUsage {
  id: string;
  workspaceId: string;
  scope: DiscussionScope;
  title: string;
  /** The recruited agent of a one-to-one discussion. */
  agentId: string | null;
  /** The team of a team discussion. */
  teamId: string | null;
  /** Teammates still due to reply in the current turn; null when the turn is complete. */
  pendingTurn: { turnId: string; queue: Array<{ agentId: string }> } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  turnId: string | null;
  speakerAgentId: string | null;
  speakerName: string | null;
  speakerRole: string | null;
  isLead: boolean;
  responseMode: ResponseMode | null;
  capabilityMode: CapabilityMode | null;
  tokensUsed: number;
  createdAt: string;
}

export interface MessageSource {
  type: string;
  title: string;
  reference: string;
  url?: string;
}

export interface AgentReply {
  message: ChatMessage;
  sources: MessageSource[];
}

/** A teammate still due to reply in the current turn. */
export interface PendingSpeaker {
  agentId: string;
  name: string;
  role: string;
  isLead: boolean;
}

export interface PostedTurn {
  userMessage: ChatMessage;
  replies: AgentReply[];
  pending: PendingSpeaker[];
  usage: SessionUsage;
}

export interface ContinuedTurn {
  reply: AgentReply | null;
  pending: PendingSpeaker[];
  usage: SessionUsage;
}

/** Reads a JSON error message from a failed response, falling back to a generic message. */
async function failure(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => ({}));
  throw new Error(body.message || body.error || fallback);
}

const sessionsUrl = `${API_BASE_URL}${API_PATHS.discussionSessions}`;
const workspaceUrl = (workspaceId: string) => `${API_BASE_URL}${API_PATHS.discussions}/${encodeURIComponent(workspaceId)}/sessions`;

/** Creates a session with exactly one target: a recruited agent or a team. */
export async function apiCreateDiscussionSession(payload: { workspaceId: string; title?: string; agentId?: string; teamId?: string }): Promise<ChatSession> {
  const response = await authorizedFetch(sessionsUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) return failure(response, "Could not create the discussion");
  return response.json();
}

export async function apiGetDiscussionSession(workspaceId: string, sessionId: string): Promise<ChatSession> {
  const response = await authorizedFetch(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}`);
  if (!response.ok) return failure(response, "Could not load the discussion");
  return response.json();
}

/** Lets the next queued teammate reply in the current turn of a team discussion. */
export async function apiContinueDiscussionTurn(workspaceId: string, sessionId: string): Promise<ContinuedTurn> {
  const response = await authorizedFetch(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}/turns/continue`, { method: "POST" });
  if (!response.ok) return failure(response, "The next teammate could not respond");
  return response.json();
}

export async function apiListDiscussionSessions(workspaceId: string): Promise<ChatSession[]> {
  const response = await authorizedFetch(workspaceUrl(workspaceId));
  if (!response.ok) return failure(response, "Could not load discussions");
  return response.json();
}

export async function apiListDiscussionMessages(workspaceId: string, sessionId: string): Promise<ChatMessage[]> {
  const response = await authorizedFetch(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}/messages`);
  if (!response.ok) return failure(response, "Could not load the conversation");
  return response.json();
}

export async function apiDeleteDiscussionSession(workspaceId: string, sessionId: string): Promise<void> {
  const response = await authorizedFetch(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (!response.ok) return failure(response, "Could not delete the discussion");
}

export async function apiPostDiscussionMessage(
  workspaceId: string,
  sessionId: string,
  payload: { message: string; responseMode: ResponseMode; capabilityMode: CapabilityMode; webEnabled: boolean },
): Promise<PostedTurn> {
  const response = await authorizedFetch(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return failure(response, "The agent could not respond");
  return response.json();
}

export async function apiListSessionConnectors(workspaceId: string, sessionId: string): Promise<string[]> {
  const response = await authorizedFetch(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}/connectors`);
  if (!response.ok) return failure(response, "Could not load attached connectors");
  return response.json();
}

export async function apiAttachSessionConnector(workspaceId: string, sessionId: string, connectionId: string): Promise<void> {
  const response = await authorizedFetch(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}/connectors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId }),
  });
  if (!response.ok) return failure(response, "Could not attach the connector");
}

export async function apiDetachSessionConnector(workspaceId: string, sessionId: string, connectionId: string): Promise<void> {
  const response = await authorizedFetch(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}/connectors/${encodeURIComponent(connectionId)}`, { method: "DELETE" });
  if (!response.ok) return failure(response, "Could not detach the connector");
}

export async function apiUploadSessionKnowledge(
  workspaceId: string,
  sessionId: string,
  payload: { fileName: string; mimeType: string; content: string; encoding: "utf8" | "base64" },
): Promise<{ chunks: number }> {
  const response = await authorizedFetch(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}/knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return failure(response, "Could not add the knowledge file");
  return response.json();
}
