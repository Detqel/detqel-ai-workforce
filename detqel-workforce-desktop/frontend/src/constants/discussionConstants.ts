import type { ActivityKind, ActivityStep } from "@/lib/api/discussions";

type StepDetail = NonNullable<ActivityStep["detail"]>;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Web search queries longer than this are shortened in the trace. */
export const ACTIVITY_QUERY_PREVIEW_LENGTH = 80;

const preview = (text: string) => (text.length > ACTIVITY_QUERY_PREVIEW_LENGTH ? `${text.slice(0, ACTIVITY_QUERY_PREVIEW_LENGTH).trimEnd()}…` : text);

/** Names in a sentence: "Ana", "Ana and Raj", "Ana, Raj and Max". */
export function listNames(names: ReadonlyArray<string>): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * How each step of an agent's reply reads in the activity trace, while it runs and once it is done. The server
 * reports only which step ran and what it found; the wording lives here.
 */
export const ACTIVITY_LABELS: Readonly<Record<ActivityKind, { running: (detail: StepDetail) => string; done: (detail: StepDetail) => string }>> = {
  understanding: {
    running: () => "Reading the request",
    done: (detail) => (detail.conversational ? "Replied directly" : "Understood the request"),
  },
  coordinating: {
    running: (detail) => `Coordinating with ${listNames(detail.names ?? [])}`,
    done: (detail) => `Handed parts of the request to ${listNames(detail.names ?? [])}`,
  },
  assigned: {
    running: (detail) => `Picking up ${detail.leadName ?? "the lead"}'s assignment`,
    done: (detail) => `Picked up ${detail.leadName ?? "the lead"}'s assignment`,
  },
  searchingKnowledge: {
    running: () => "Searching session knowledge",
    done: (detail) => (detail.count ? `Searched session knowledge · ${plural(detail.count, "passage", "passages")}` : "Searched session knowledge · nothing relevant"),
  },
  searchingWeb: {
    running: (detail) => (detail.query ? `Searching the web for “${preview(detail.query)}”` : "Searching the web"),
    done: (detail) => (detail.count ? `Searched the web · ${plural(detail.count, "result", "results")}` : "Searched the web · no results"),
  },
  drafting: {
    running: () => "Drafting an answer",
    done: () => "Drafted an answer",
  },
  reviewing: {
    running: (detail) => (detail.count ? `Checking the draft against ${plural(detail.count, "source", "sources")}` : "Checking the draft"),
    done: () => "Checked the draft",
  },
  writing: {
    running: () => "Writing the reply",
    done: () => "Wrote the reply",
  },
  writingDocument: {
    running: (detail) => `Writing “${detail.title ?? "the document"}”`,
    done: (detail) => `Wrote “${detail.title ?? "the document"}”`,
  },
  savingDocument: {
    running: detail => detail.count ? `Generating ${detail.count} document image${detail.count === 1 ? "" : "s"}, preparing layout, and saving` : "Preparing final layout and saving the document",
    done: (detail) => `Saved as ${detail.fileName ?? "a document"} in artifacts`,
  },
  consolidating: {
    running: (detail) => (detail.names?.length ? `Bringing together ${listNames(detail.names)}'s input` : "Bringing the team's input together"),
    done: (detail) => (detail.names?.length ? `Brought together ${listNames(detail.names)}'s input` : "Brought the team's input together"),
  },
  readingConnector: {
    running: (detail) => toolLabel(detail, "running"),
    done: (detail) => toolLabel(detail, "done"),
  },
  readingKnowledge: {
    running: (detail) => toolLabel(detail, "running"),
    done: (detail) => toolLabel(detail, "done"),
  },
};

/** How each agent reading tool reads in the trace, in progress and finished. Keys are the server's tool names. */
const TOOL_VERBS: Readonly<Record<string, { running: string; done: string }>> = {
  search_knowledge: { running: "Searching knowledge documents", done: "Searched knowledge documents" },
  read_knowledge_document: { running: "Reading", done: "Read" },
  describe_connector: { running: "Mapping the structure of", done: "Mapped the structure of" },
  query_database: { running: "Querying", done: "Queried" },
  read_repository: { running: "Reading", done: "Read" },
  read_files: { running: "Reading", done: "Read" },
  fetch_api: { running: "Calling", done: "Called" },
  list_mcp_tools: { running: "Listing the tools of", done: "Listed the tools of" },
  call_mcp_tool: { running: "Using", done: "Used" },
};

/** "Queried Sales DB · SELECT …": the verb, what was read, and a short preview of the request. */
function toolLabel(detail: StepDetail, phase: "running" | "done"): string {
  const verbs = TOOL_VERBS[detail.tool ?? ""] ?? { running: "Reading", done: "Read" };
  const subject = detail.tool === "search_knowledge" ? "" : ` ${detail.target ?? "a connector"}`;
  const action = detail.action ? ` · ${preview(detail.action)}` : "";
  return `${verbs[phase]}${subject}${action}`;
}

/** Formats a reply or document can be exported to, in menu order. */
export const EXPORT_FORMATS = [
  { format: "pdf", label: "PDF" },
  { format: "docx", label: "Word (.docx)" },
  { format: "md", label: "Markdown (.md)" },
] as const;

/** Largest file the user can add to a discussion's artifacts; it travels as base64 through the desktop bridge. */
export const ARTIFACT_UPLOAD_MAX_BYTES = 700 * 1024;

/** Largest knowledge document the server accepts. */
export const KNOWLEDGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Knowledge must be text the agents can read; the file picker offers these types. */
export const KNOWLEDGE_UPLOAD_ACCEPT = ".txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.yaml,.yml,.xml,.html,.htm,.log,.sql,.ts,.tsx,.jsx,.py,.java,.cs,.go,.rb,.php,.rs,.kt,.swift,.c,.h,.cpp,.css,text/*";

/** Longest discussion title the server accepts. */
export const DISCUSSION_TITLE_MAX_LENGTH = 255;
