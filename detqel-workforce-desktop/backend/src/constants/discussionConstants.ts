/**
 * Discussions are the main agentic chat surface. A turn runs in one of two capability modes and one of two
 * response modes. Fast is a single gateway pass with no tool use or deep retrieval (still correct, just
 * shallower). Expert plans, retrieves from the session knowledge base, attached connectors, and the web, then
 * synthesizes and self-checks, routing any mutating connector operation back for confirmation. Brief/Detailed
 * only shapes verbosity via the prompt and never changes the model.
 */
export const DISCUSSION_RESPONSE_MODES = { brief: "brief", detailed: "detailed" } as const;
export type DiscussionResponseMode = (typeof DISCUSSION_RESPONSE_MODES)[keyof typeof DISCUSSION_RESPONSE_MODES];

export const DISCUSSION_CAPABILITY_MODES = { fast: "fast", expert: "expert" } as const;
export type DiscussionCapabilityMode = (typeof DISCUSSION_CAPABILITY_MODES)[keyof typeof DISCUSSION_CAPABILITY_MODES];

export const DISCUSSION_MESSAGE_ROLES = { user: "user", assistant: "assistant" } as const;

export const DISCUSSION_SOURCE_TYPES = { knowledge: "knowledge", web: "web", connection: "connection" } as const;

/** Verbosity guidance injected into the system prompt, keyed by response mode. Pure prompt-shaping. */
export const DISCUSSION_RESPONSE_SHAPING: Readonly<Record<DiscussionResponseMode, string>> = {
    [DISCUSSION_RESPONSE_MODES.brief]: "Answer briefly: lead with the direct answer in one or two short paragraphs, omit preamble, and include only essential detail.",
    [DISCUSSION_RESPONSE_MODES.detailed]: "Answer thoroughly: explain reasoning, cover relevant detail and edge cases, and structure the response with short sections or lists where helpful.",
};

/** Capability guidance appended to the system prompt. */
export const DISCUSSION_CAPABILITY_SHAPING: Readonly<Record<DiscussionCapabilityMode, string>> = {
    [DISCUSSION_CAPABILITY_MODES.fast]: "Respond from the provided context and your own knowledge at a high level. Do not claim to have searched sources you were not given.",
    [DISCUSSION_CAPABILITY_MODES.expert]: "Use the retrieved knowledge, connector data, and web results provided to you. Ground claims in those sources and cite them.",
};

export const DISCUSSION_LIMITS = {
    maxMessageCharacters: 32_000,
    expertRetrievalTopK: 5,
    expertWebResults: 5,
    /** Teammates the lead may hand one turn to, so a single message cannot fan out across a whole team. */
    maxDelegates: 3,
    /** Upper bound on the triage reply, which is short by design. */
    triageMaxTokens: 600,
    /** Upper bound on a memory summary. */
    summaryMaxTokens: 700,
    maxAssignmentCharacters: 500,
} as const;

/**
 * Memory: every message not yet covered by the session summary is sent verbatim, so nothing falls between the
 * summary and the transcript. Once more than `triggerAfter` messages sit outside the summary, all but the most
 * recent `keepRecent` are folded into it in the background after the turn, keeping each call's context bounded.
 */
export const DISCUSSION_MEMORY = { triggerAfter: 20, keepRecent: 8 } as const;

/**
 * Reasoning effort per step. Triage is a short classification-and-reply call and needs no hidden reasoning,
 * which keeps conversational messages fast and cheap. A fast answer reasons lightly; an expert answer uses
 * the provider's default. Measured on the live gateway, minimal effort cut a greeting's cost by about 95%.
 */
export const DISCUSSION_REASONING = {
    triage: "minimal",
    fastAnswer: "low",
    selfCheck: "low",
    summary: "minimal",
} as const;

/** Whether a message needs real work or is conversational and answered directly by the triage step. */
export const DISCUSSION_INTENTS = { conversational: "conversational", task: "task" } as const;
export type DiscussionIntent = (typeof DISCUSSION_INTENTS)[keyof typeof DISCUSSION_INTENTS];

/** Keys of the JSON object the triage step returns. */
export const DISCUSSION_TRIAGE_KEYS = { intent: "intent", reply: "reply", delegate: "delegate", name: "name", task: "task", document: "document", title: "title" } as const;

/** How a participant takes part in the current turn. */
export const DISCUSSION_SPEAKER_ROLES = {
    /** One-to-one discussion with a single agent. */
    solo: "solo",
    /** A team lead, who may hand parts of the request to teammates. */
    lead: "lead",
    /** A teammate the user addressed by name, answering directly. */
    addressed: "addressed",
    /** A teammate the lead handed part of the request to. */
    delegate: "delegate",
    /** The lead again, after its teammates replied, bringing their contributions into one answer. */
    wrapUp: "wrapUp",
} as const;
export type DiscussionSpeakerRole = (typeof DISCUSSION_SPEAKER_ROLES)[keyof typeof DISCUSSION_SPEAKER_ROLES];

/**
 * High-level steps an agent works through for one reply, shown to the user as single-line activity traces and
 * kept with the reply. The UI words each step; the server only reports which step ran and its outcome.
 */
export const DISCUSSION_ACTIVITY_KINDS = {
    /** Reading the message and deciding whether it needs real work (the triage call). */
    understanding: "understanding",
    /** The lead handing parts of the request to teammates. */
    coordinating: "coordinating",
    /** A teammate picking up what the lead assigned. */
    assigned: "assigned",
    searchingKnowledge: "searchingKnowledge",
    searchingWeb: "searchingWeb",
    /** Expert mode: writing a draft that is checked before it is shown. */
    drafting: "drafting",
    /** Expert mode: checking the draft against the sources while writing the final reply. */
    reviewing: "reviewing",
    /** Writing the reply the user sees. */
    writing: "writing",
    /** The lead bringing its teammates' contributions together into one answer. */
    consolidating: "consolidating",
    /** Writing a document the user asked for; the reply is the document. */
    writingDocument: "writingDocument",
    /** Saving that document in the discussion's artifacts. */
    savingDocument: "savingDocument",
} as const;
export type DiscussionActivityKind = (typeof DISCUSSION_ACTIVITY_KINDS)[keyof typeof DISCUSSION_ACTIVITY_KINDS];

export const DISCUSSION_ACTIVITY_STATUSES = { running: "running", done: "done", failed: "failed" } as const;
export type DiscussionActivityStatus = (typeof DISCUSSION_ACTIVITY_STATUSES)[keyof typeof DISCUSSION_ACTIVITY_STATUSES];

/** Events of a streamed turn, one JSON object per line. */
export const DISCUSSION_STREAM_EVENTS = {
    /** The user's message was saved; first event of a new turn. */
    turn: "turn",
    /** An agent starts its reply. */
    speaker: "speaker",
    /** An activity step started or finished. */
    activity: "activity",
    /** Text of the reply being written. */
    token: "token",
    /** The reply was saved; carries the stored message and the session's usage totals. */
    reply: "reply",
    /** Teammates still due to reply in this turn. */
    pending: "pending",
    done: "done",
    error: "error",
} as const;

export const DISCUSSION_STREAM = {
    /** Graph steps one speaker can take (next speaker, triage, research, draft, review, save), plus headroom. */
    graphStepsPerSpeaker: 8,
} as const;

/** Temperature kept low for a calm, consistent, professional voice. */
export const DISCUSSION_TEMPERATURE = 0.3;

export const DISCUSSION_ERRORS = {
    emptyMessage: "A message is required.",
    messageTooLong: "The message is longer than the allowed limit.",
    sessionNotFound: "The discussion session was not found.",
    connectionNotInWorkspace: "The connector does not belong to this workspace.",
    unknownResponseMode: "An unknown response mode was requested.",
    unknownCapabilityMode: "An unknown capability mode was requested.",
    agentUnavailable: "The selected agent is not available in this workspace.",
    teamUnavailable: "The selected team is not available in this workspace.",
    teamWithoutMembers: "This team has no members. Add agents to the team before starting a discussion.",
    targetRequired: "A discussion needs an agent or a team.",
    sessionWithoutParticipants: "This discussion is no longer linked to an agent or team. Start a new discussion.",
    nothingPending: "No teammate is waiting to reply in this discussion.",
    replyInProgress: "A teammate is already replying in this discussion.",
    turnFailed: "The discussion could not continue. Try again.",
    targetConflict: "A discussion is with either an agent or a team, not both.",
} as const;
