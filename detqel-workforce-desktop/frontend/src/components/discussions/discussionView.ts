import type { DiscussionTarget } from "@/lib/discussionStore";
import type { ChatMessage as ApiChatMessage, MessageSource, SessionUsage } from "@/lib/api/discussions";

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
  timestamp: string;
  sources?: ChatMessageSource[];
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
  };
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
