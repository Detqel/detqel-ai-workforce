export interface DiscussionTarget {
  type: "agent" | "team";
  id: string;
  name: string;
  role?: string;
  focus?: string;
  accentColor?: string;
  avatarLetter?: string;
  memberCount?: number;
}

const STORAGE_KEY = "detqel_active_discussion_target";
const SESSION_STORAGE_KEY = "kin_discussion_session_target";

export function setDiscussionSessionTarget(target: { workspaceId: string; sessionId: string; questionId?: string }): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(target));
  clearDiscussionTarget();
}

export function takeDiscussionSessionTarget(workspaceId: string): { sessionId: string; questionId?: string } | null {
  const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value.workspaceId === workspaceId && typeof value.sessionId === "string" && (value.questionId === undefined || typeof value.questionId === "string") ? value : null;
  } catch { return null; }
}

export function setDiscussionTarget(target: DiscussionTarget): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(target));
  }
}

export function getDiscussionTarget(): DiscussionTarget | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DiscussionTarget;
  } catch {
    return null;
  }
}

export function clearDiscussionTarget(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

