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

