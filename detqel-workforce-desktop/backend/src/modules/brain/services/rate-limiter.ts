import { BRAIN_ERRORS } from "../../../constants/brainConstants.js";
import { AppError } from "../../../shared/errors/app-error.js";

const MAX_TRACKED_KEYS = 2_048;

/**
 * Per-key sliding-window limit for expensive operations (model calls, manual syncs), so one user or workspace
 * cannot run up model cost or exhaust a source system (NFR-010). In-process, because the desktop runs one API.
 */
export class SlidingWindowLimiter {
    private readonly hits = new Map<string, number[]>();

    constructor(private readonly limit: number, private readonly windowMs: number) {}

    consume(key: string): void {
        const now = Date.now();
        const recent = (this.hits.get(key) ?? []).filter(at => at > now - this.windowMs);
        if (recent.length >= this.limit) throw new AppError(429, BRAIN_ERRORS.rateLimited);
        recent.push(now);
        this.hits.delete(key);
        this.hits.set(key, recent);
        if (this.hits.size > MAX_TRACKED_KEYS) this.hits.delete(this.hits.keys().next().value!);
    }
}
