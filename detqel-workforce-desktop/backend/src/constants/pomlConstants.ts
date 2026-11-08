/**
 * POML (Prompt Orchestration Markup Language) is the authoring format for every agent prompt. Prompt text
 * lives in .poml files, never in the database. Two roots are used: platform/seed agents ship read-only inside
 * the bundled resources directory, while user-created agents are written into the hardened private runtime
 * directory and resolved by agent id. The renderer supports the subset of POML components the product uses and
 * is deliberately dependency-free so no heavy or conflicting package enters the secured backend sidecar.
 */
export const POML_FILE_EXTENSION = ".poml";

/** Directory name for bundled, read-only platform/seed agent prompts, shipped under the backend resources. */
export const POML_BUNDLED_DIRECTORY = "poml";

/**
 * Location of the bundled prompts relative to the loader factory module (src/shared/agents/poml or
 * dist/shared/agents/poml), which is four levels below the backend root in both layouts.
 */
export const POML_BUNDLED_RELATIVE_URL = "../../../../poml/";

/** Bundled POML prompts that drive discussions. They are global protocol, not any agent's persona. */
export const POML_DISCUSSION_IDS = {
    team: "discussion-team",
    triage: "discussion-triage",
    delegationLead: "discussion-delegation-lead",
    delegationNone: "discussion-delegation-none",
    leadHandoff: "discussion-lead-handoff",
    leadWrapUp: "discussion-lead-wrap-up",
    document: "discussion-document",
    assignment: "discussion-assignment",
    addressed: "discussion-addressed",
    selfCheck: "discussion-self-check",
    summary: "discussion-summary",
} as const;

/** Subdirectory under the private runtime directory holding user-authored agent prompts. */
export const POML_RUNTIME_DIRECTORY = "poml";

/** The one global-guidance file applied to every rendered prompt (sourced from VYRA global instructions). */
export const POML_GLOBAL_GUIDANCE_ID = "global-guidance";

export const POML_FILE_MODES = { directory: 0o700, file: 0o600 } as const;

export const POML_TEMP = { prefix: ".poml-", suffix: ".tmp", randomBytes: 8, encoding: "hex" } as const;

/** Components the renderer understands, in the order they are emitted into the final system prompt. */
export const POML_COMPONENTS = {
    role: "role",
    purpose: "purpose",
    task: "task",
    instructions: "instructions",
    context: "context",
    boundaries: "boundaries",
    outputFormat: "output-format",
    example: "example",
    globalGuidance: "global-guidance",
} as const;

export const POML_ROOT_TAG = "poml";

/** Human-readable section headers emitted before each component's content in the rendered prompt. */
export const POML_SECTION_HEADERS: Readonly<Record<string, string>> = {
    [POML_COMPONENTS.role]: "Role",
    [POML_COMPONENTS.purpose]: "Purpose",
    [POML_COMPONENTS.task]: "Task",
    [POML_COMPONENTS.instructions]: "Instructions",
    [POML_COMPONENTS.context]: "Context",
    [POML_COMPONENTS.boundaries]: "Boundaries",
    [POML_COMPONENTS.outputFormat]: "Output format",
    [POML_COMPONENTS.example]: "Example",
    [POML_COMPONENTS.globalGuidance]: "Global guidance",
};

/** Fixed tone every agent must follow, prepended to the global guidance so it is always present. */
export const POML_BASE_TONE = "Maintain a calm, professional tone at all times.";

/** A referenced agent id must be a safe file-name token so it can never escape the POML directory. */
export const POML_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Templating delimiters for {{ variable }} substitution inside a .poml file. */
export const POML_TEMPLATE = { open: "{{", close: "}}" } as const;

/** Upper bound on a .poml file so a malformed or hostile file cannot exhaust memory during rendering. */
export const POML_MAX_FILE_BYTES = 256 * 1024;

export const POML_ERRORS = {
    invalidId: "The requested agent prompt identifier is not valid.",
    notFound: "No POML prompt was found for the requested agent.",
    unreadable: "The POML prompt could not be read.",
    oversized: "The POML prompt file is unexpectedly large.",
    malformed: "The POML prompt could not be parsed.",
    emptyRender: "The POML prompt produced no content.",
    unresolvedVariable: "The POML prompt references a variable that was not provided.",
} as const;
