export interface VerificationCheck { readonly name: string; readonly passed: boolean; readonly detail: string }
export interface VerificationReport { readonly verified: boolean; readonly checks: VerificationCheck[]; readonly ungroundedNumbers: string[] }
export interface StepOutcome { readonly index: number; readonly tool: string; readonly status: string; readonly hasOutput: boolean; readonly error: string | null }

const NUMBER = /[-+]?\$?\d[\d,]*(?:\.\d+)?\s?(?:%|[kKmMbB](?![a-z]))?/g;
const SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

/** The numeric value a token denotes, with its scale suffix applied ("$24.5M" is 24,500,000). */
export function numericValue(token: string): number | null {
    const match = /([-+]?)\$?([\d,]*\.?\d+)\s?(%|[kKmMbB])?/.exec(token.trim());
    if (!match) return null;
    const value = Number(match[2].replace(/,/g, ""));
    if (!Number.isFinite(value)) return null;
    const suffix = match[3]?.toLowerCase();
    return (match[1] === "-" ? -1 : 1) * value * (suffix && suffix !== "%" ? SCALE[suffix] : 1);
}

export function numbersIn(text: string): string[] {
    return (text.match(NUMBER) ?? []).map(token => token.trim()).filter(Boolean);
}

/** Small counts, list positions and calendar years are not claims a model could invent harmfully. */
function trivial(value: number, token: string): boolean {
    const abs = Math.abs(value);
    if (!token.includes("%") && !token.includes("$") && Number.isInteger(value) && abs <= 12) return true;
    return Number.isInteger(value) && abs >= 1900 && abs <= 2100 && !token.includes("$") && !token.includes(",");
}

/**
 * Model-written text may only repeat numbers the deterministic tools produced (PRD 4.2: an LLM may explain but
 * not invent numeric results). A number counts as grounded when the evidence holds the same value, allowing for
 * rounding to the precision written; otherwise it is reported and the text is not used.
 */
export function groundedNumbers(text: string, evidence: ReadonlyArray<string>): { ungrounded: string[] } {
    const available = evidence.flatMap(numbersIn).map(token => ({ token, value: numericValue(token) })).filter((item): item is { token: string; value: number } => item.value !== null);
    const ungrounded: string[] = [];
    for (const token of numbersIn(text)) {
        const value = numericValue(token);
        if (value === null || trivial(value, token)) continue;
        const decimals = (/\.(\d+)/.exec(token)?.[1].length ?? 0);
        const suffix = /[kKmMbB]\s*$/.test(token) ? SCALE[token.trim().slice(-1).toLowerCase()] : 1;
        const tolerance = Math.max(Math.abs(value) * 0.005, 0.5 * 10 ** -decimals * suffix);
        const percent = token.includes("%");
        const matched = available.some(item => item.token.includes("%") === percent && Math.abs(item.value - value) <= tolerance);
        if (!matched) ungrounded.push(token);
    }
    return { ungrounded };
}

/**
 * Completion evidence (FR-AGT-007): a step counts as done only when its tool returned a result. Failed, blocked
 * and waiting steps stay visible as such, and the task is never reported complete while any of them remain.
 */
export function verifyExecution(steps: ReadonlyArray<StepOutcome>): VerificationReport {
    const checks: VerificationCheck[] = [];
    const succeeded = steps.filter(step => step.status === "succeeded");
    checks.push({ name: "results-returned", passed: succeeded.every(step => step.hasOutput), detail: `${succeeded.length} of ${steps.length} step(s) returned a verifiable result.` });
    const failed = steps.filter(step => step.status === "failed" || step.status === "blocked");
    checks.push({ name: "no-failed-steps", passed: failed.length === 0, detail: failed.length ? failed.map(step => `${step.tool}: ${step.error ?? step.status}`).join("; ") : "No step failed or was blocked." });
    const waiting = steps.filter(step => step.status === "waiting_approval");
    checks.push({ name: "no-pending-approvals", passed: waiting.length === 0, detail: waiting.length ? `${waiting.length} step(s) wait for human approval.` : "No step is waiting for approval." });
    return { verified: checks.every(check => check.passed), checks, ungroundedNumbers: [] };
}
