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
  /** The speaker's part in the turn; a delegate's reply is a handoff. */
  turnRole: TurnRole | null;
  responseMode: ResponseMode | null;
  capabilityMode: CapabilityMode | null;
  /** The steps the agent worked through for this reply. */
  activity: ActivityStep[];
  tokensUsed: number;
  createdAt: string;
}

/** How a speaker takes part in a turn: alone, as the lead, named by the user, handed work, or closing as the lead. */
export type TurnRole = "solo" | "lead" | "addressed" | "delegate" | "wrapUp";

export type ActivityKind =
  | "understanding" | "coordinating" | "assigned" | "searchingKnowledge" | "searchingWeb" | "drafting" | "reviewing" | "writing" | "consolidating"
  | "writingDocument" | "savingDocument";

/** One high-level step of an agent's reply. */
export interface ActivityStep {
  id: string;
  kind: ActivityKind;
  status: "running" | "done" | "failed";
  detail?: { count?: number; query?: string; names?: string[]; leadName?: string; task?: string; conversational?: boolean; title?: string; fileName?: string };
  startedAt: string;
  durationMs?: number;
}

export interface MessageSource {
  type: string;
  title: string;
  reference: string;
  url?: string;
}

/** A teammate still due to reply in the current turn. */
export interface PendingSpeaker {
  agentId: string;
  name: string;
  role: string;
  isLead: boolean;
}

/** Events of a streamed turn, in the order the server writes them. */
export type TurnEvent =
  | { type: "turn"; userMessage: ChatMessage }
  | { type: "speaker"; agentId: string; name: string; role: string; isLead: boolean; turnRole: TurnRole }
  | { type: "activity"; agentId: string; step: ActivityStep }
  | { type: "token"; agentId: string; text: string }
  | { type: "reply"; agentId: string; message: ChatMessage; sources: MessageSource[]; usage: SessionUsage }
  | { type: "pending"; speakers: PendingSpeaker[] }
  | { type: "done"; usage: SessionUsage }
  | { type: "error"; message: string };

/**
 * Sends a request whose response is a stream of turn events, one JSON object per line, and hands each event to
 * onEvent as it arrives. Rejects with the server's message when the request is refused or the turn fails.
 */
async function streamTurn(url: string, init: RequestInit, onEvent: (event: TurnEvent) => void, fallback: string): Promise<void> {
  const response = await authorizedFetch(url, init, { stream: true });
  if (!response.ok) return failure(response, fallback);
  if (!response.body) throw new Error(fallback);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let finished = false;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as TurnEvent;
    if (event.type === "error") throw new Error(event.message || fallback);
    if (event.type === "done") finished = true;
    onEvent(event);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(handle);
    }
    handle(pending + decoder.decode());
  } finally {
    reader.releaseLock();
  }
  if (!finished) throw new Error(fallback);
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

/** Streams the rest of a turn the user left before every agent replied. */
export function apiStreamContinueTurn(workspaceId: string, sessionId: string, onEvent: (event: TurnEvent) => void, signal: AbortSignal): Promise<void> {
  return streamTurn(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}/turns/continue`, { method: "POST", signal }, onEvent, "The discussion could not continue");
}

export async function apiRenameDiscussionSession(workspaceId: string, sessionId: string, title: string): Promise<ChatSession> {
  const response = await authorizedFetch(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) return failure(response, "Could not rename the discussion");
  return response.json();
}

export type ExportFormat = "md" | "docx" | "pdf";

/** A file kept in a discussion: a document an agent wrote, an exported reply, or a file the user added. */
export interface SessionArtifact {
  fileName: string;
  mimeType: string;
  size: number;
  modifiedAt: string;
}

/** A file to download. Content is base64 so binary files survive the desktop bridge. */
export interface DownloadableFile {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

const artifactsUrl = (workspaceId: string, sessionId: string) => `${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}/artifacts`;

/** Exports one agent reply; the file is also kept in the discussion's artifacts. */
export async function apiExportDiscussionMessage(workspaceId: string, sessionId: string, messageId: string, format: ExportFormat): Promise<DownloadableFile> {
  const response = await authorizedFetch(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format }),
  });
  if (!response.ok) return failure(response, "Could not export the reply");
  return response.json();
}

export async function apiListSessionArtifacts(workspaceId: string, sessionId: string): Promise<SessionArtifact[]> {
  const response = await authorizedFetch(artifactsUrl(workspaceId, sessionId));
  if (!response.ok) return failure(response, "Could not load the discussion's artifacts");
  return response.json();
}

export async function apiDownloadSessionArtifact(workspaceId: string, sessionId: string, fileName: string): Promise<DownloadableFile> {
  const response = await authorizedFetch(`${artifactsUrl(workspaceId, sessionId)}/${encodeURIComponent(fileName)}`);
  if (!response.ok) return failure(response, "Could not download the file");
  return response.json();
}

/** Converts a Markdown document in the artifacts to Word or PDF; the result is kept beside it. */
export async function apiExportSessionArtifact(workspaceId: string, sessionId: string, fileName: string, format: ExportFormat): Promise<DownloadableFile> {
  const response = await authorizedFetch(`${artifactsUrl(workspaceId, sessionId)}/${encodeURIComponent(fileName)}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format }),
  });
  if (!response.ok) return failure(response, "Could not convert the document");
  return response.json();
}

export async function apiDeleteSessionArtifact(workspaceId: string, sessionId: string, fileName: string): Promise<void> {
  const response = await authorizedFetch(`${artifactsUrl(workspaceId, sessionId)}/${encodeURIComponent(fileName)}`, { method: "DELETE" });
  if (!response.ok) return failure(response, "Could not remove the file");
}

export async function apiUploadSessionArtifact(workspaceId: string, sessionId: string, payload: { fileName: string; mimeType: string; contentBase64: string }): Promise<SessionArtifact> {
  const response = await authorizedFetch(artifactsUrl(workspaceId, sessionId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return failure(response, "Could not add the file");
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

/** Posts a message and streams the turn that answers it: who speaks, each step they take, and their reply. */
export function apiStreamDiscussionMessage(
  workspaceId: string,
  sessionId: string,
  payload: { message: string; responseMode: ResponseMode; capabilityMode: CapabilityMode; webEnabled: boolean },
  onEvent: (event: TurnEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  return streamTurn(`${workspaceUrl(workspaceId)}/${encodeURIComponent(sessionId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  }, onEvent, "The agent could not respond");
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
