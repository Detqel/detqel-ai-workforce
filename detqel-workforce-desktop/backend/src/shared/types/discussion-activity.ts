import type { DiscussionActivityKind, DiscussionActivityStatus } from "../../constants/discussionConstants.js";

/** Facts about a step the UI shows next to it, such as how many sources a search found. */
export interface DiscussionActivityDetail {
    /** Results found by a search. */
    readonly count?: number;
    /** What a web search looked for. */
    readonly query?: string;
    /** Teammates the lead handed work to. */
    readonly names?: ReadonlyArray<string>;
    /** The lead who assigned a teammate's work, and what they asked for. */
    readonly leadName?: string;
    readonly task?: string;
    /** For the triage step: the message was conversational and answered directly. */
    readonly conversational?: boolean;
    /** For a document: its title, and the artifact file it was saved as. */
    readonly title?: string;
    readonly fileName?: string;
}

/** One high-level step of an agent's reply, streamed as it happens and kept with the saved reply. */
export interface DiscussionActivityStep {
    readonly id: string;
    readonly kind: DiscussionActivityKind;
    readonly status: DiscussionActivityStatus;
    readonly detail?: DiscussionActivityDetail;
    /** ISO time the step started. */
    readonly startedAt: string;
    /** Set once the step finished. */
    readonly durationMs?: number;
}
