import type { CallUsage } from "../litellm.client.js";
import type { DiscussionActivityStep } from "../../types/discussion-activity.js";
import type { DiscussionSource } from "./discussion-runtime.js";

/** Trusted observations, captured by repository tools rather than asserted by a model. */
export interface RepositoryCompletionEvidence {
    readonly hasSourceReads: boolean;
    readonly exhaustive: boolean;
    readonly report: string;
}

export function repositoryCompletionIssues(content: string, evidence: RepositoryCompletionEvidence): string[] {
    const issues: string[] = [];
    if (!evidence.hasSourceReads) issues.push("Repository claims have no inspected source-file evidence. Do not present the requested repository analysis as complete.");
    if (!evidence.exhaustive && /\b(?:fully|completely|exhaustively)\s+(?:analy[sz]ed|reviewed|inspected)\s+(?:the\s+)?(?:entire\s+|whole\s+)?(?:repository|codebase)\b|\b(?:every|all)\s+(?:source\s+)?files?\s+(?:was|were|have been)\s+(?:read|reviewed|inspected)\b/i.test(content)) {
        issues.push("Remove unsupported exhaustive-analysis claims. Describe actual inspected coverage and remaining gaps.");
    }
    return issues;
}

/** Private execution state. Never included in the session's public API representation. */
export interface TurnCheckpoint {
    readonly version: 1;
    readonly agentId: string;
    readonly stage: "review" | "save" | "commit";
    readonly candidate: string;
    readonly reviewRevision: number;
    readonly grounding: string;
    readonly sources: ReadonlyArray<DiscussionSource>;
    readonly repositoryEvidence?: RepositoryCompletionEvidence;
    readonly usage: CallUsage;
    readonly steps: ReadonlyArray<DiscussionActivityStep>;
}
