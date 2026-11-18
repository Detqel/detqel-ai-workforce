export const PROMPT_FILE_EXTENSION = ".md";
export const PROMPT_BUNDLED_DIRECTORY = "prompts";
export const PROMPT_BUNDLED_RELATIVE_URL = "../../../../prompts/";
export const PROMPT_RUNTIME_DIRECTORY = "prompts";
export const PROMPT_AGENT_DIRECTORY = "agents";
export const PROMPT_DISCUSSION_IDS = {
    team: "discussion-team", triage: "discussion-triage", delegationLead: "discussion-delegation-lead",
    delegationNone: "discussion-delegation-none", leadHandoff: "discussion-lead-handoff",
    leadWrapUp: "discussion-lead-wrap-up", document: "discussion-document", assignment: "discussion-assignment",
    addressed: "discussion-addressed", selfCheck: "discussion-self-check", summary: "discussion-summary",
} as const;
export const PROMPT_GLOBAL_GUIDANCE_ID = "global-guidance";
export const PROMPT_FILE_MODES = { directory: 0o700, file: 0o600 } as const;
export const PROMPT_TEMP = { prefix: ".prompt-", suffix: ".tmp", randomBytes: 8, encoding: "hex" } as const;
export const PROMPT_BASE_TONE = "Maintain a calm, professional tone at all times.";
export const PROMPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const PROMPT_MAX_FILE_BYTES = 256 * 1024;
export const PROMPT_MAX_RENDER_CHARACTERS = 1_000_000;
export const PROMPT_ERRORS = {
    invalidId: "The requested agent prompt identifier is not valid.",
    notFound: "No Markdown prompt was found for the requested agent.",
    unreadable: "The Markdown prompt could not be read.",
    oversized: "The Markdown prompt exceeds the supported size.",
    empty: "The Markdown prompt contains no instructions.",
    unresolvedVariable: "The Markdown prompt references a variable that was not provided.",
} as const;
