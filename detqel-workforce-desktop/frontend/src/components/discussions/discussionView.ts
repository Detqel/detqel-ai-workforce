import type { DiscussionTarget } from "@/lib/discussionStore";
import type { ActivityStep, ChatMessage as ApiChatMessage, MessageSource, SessionUsage, TurnRole } from "@/lib/api/discussions";

export interface ChatMessageSource {
  title: string;
  url?: string;
  reference?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sender?: string;
  senderRole?: string;
  senderAvatarLetter?: string;
  isLead?: boolean;
  /** The speaker's part in the turn; a delegate's reply is a handoff, shown as one line and read in the viewer. */
  turnRole?: TurnRole;
  timestamp: string;
  sources?: ChatMessageSource[];
  /** The steps the agent worked through for this reply. */
  activity?: ActivityStep[];
  /** The reply is still being written; it is not saved yet. */
  streaming?: boolean;
}

export const EMPTY_USAGE: SessionUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };

export const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Maps a persisted backend message into the shape the chat renders. An agent reply is shown under the agent
 * who wrote it. Replies saved before speakers were recorded belong to the session's own agent, so they take
 * the target's name.
 */
export function toViewMessage(message: ApiChatMessage, target: DiscussionTarget | null, sources?: MessageSource[]): ChatMessage {
  const assistant = message.role === "assistant";
  const sender = assistant ? message.speakerName ?? target?.name : undefined;
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    sender,
    senderRole: assistant ? message.speakerRole ?? target?.role : undefined,
    senderAvatarLetter: sender ? sender[0] : undefined,
    isLead: assistant && message.isLead,
    timestamp: formatTime(new Date(message.createdAt)),
    sources: sources?.map((source) => ({ title: source.title, url: source.url, reference: source.reference })),
    activity: assistant ? message.activity : undefined,
    turnRole: assistant ? message.turnRole ?? undefined : undefined,
  };
}

export const isHandoff = (message: ChatMessage) => message.turnRole === "delegate";

/** The document a reply is, from its document steps: its title, and the file once it is saved. */
export function documentOf(message: ChatMessage): { title: string; fileName?: string; saved: boolean } | null {
  const title = message.activity?.find((step) => step.kind === "writingDocument")?.detail?.title;
  if (!title) return null;
  const saving = message.activity?.find((step) => step.kind === "savingDocument" && step.status === "done");
  return { title, fileName: saving?.detail?.fileName, saved: Boolean(saving) };
}

/** Replies shown as one compact line with a viewer instead of in full: handoffs and documents. */
export const isCompact = (message: ChatMessage) => isHandoff(message) || documentOf(message) !== null;

/** A reply that is saved on the server, so it can be exported. */
export const isSaved = (message: ChatMessage) => !message.streaming && !message.id.startsWith("live-");

/** What the lead asked a teammate to do, from the handoff's first step. */
export const handoffTask = (message: ChatMessage) => message.activity?.find((step) => step.kind === "assigned")?.detail;

/** Total time a reply's steps took. */
export const workedFor = (steps: ReadonlyArray<ActivityStep> | undefined) => (steps ?? []).reduce((sum, step) => sum + (step.durationMs ?? 0), 0);

/** Adds a step, or updates it when the same step reports again (running, then done or failed). */
export function upsertStep(steps: ActivityStep[] | undefined, step: ActivityStep): ActivityStep[] {
  const current = steps ?? [];
  return current.some((existing) => existing.id === step.id)
    ? current.map((existing) => (existing.id === step.id ? step : existing))
    : [...current, step];
}

/** Durations under a minute show tenths of a second; longer ones show minutes and seconds. */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`;
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}


const tokenFormat = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const exactFormat = new Intl.NumberFormat();

export const formatTokens = (value: number) => tokenFormat.format(value);
export const formatTokensExact = (value: number) => exactFormat.format(value);

/** Small costs keep enough digits to stay visible; anything from a dollar up shows cents. */
export function formatCost(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value >= 1 ? 2 : 5,
  });
}
