/** Token counts are measured by the configured LiteLLM deployment, rather than cumulative billing usage. */
export interface ConversationContext {
    model: string;
    inputTokens: number;
    maxInputTokens: number;
    reservedOutputTokens: number;
    thresholdTokens: number;
    measuredAt: string;
    compactionCount: number;
    lastCompactedAt: string | null;
}

export const CONTEXT_COMPACTION = {
    triggerRatio: 0.8,
    summaryMaxTokens: 2_000,
    summaryBatchRatio: 0.4,
    keepRecentMessages: 4,
} as const;
