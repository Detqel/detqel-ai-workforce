import { createHash } from "node:crypto";
import type { BrainStatementKind } from "../../../constants/brainConstants.js";

/**
 * Who is acting. Tenant and role always come from the verified session (or the scheduler), never from request
 * bodies, so a client cannot widen its own scope.
 */
export interface BrainActor {
    readonly kind: "user" | "system";
    readonly userId: string | null;
    readonly workspaceId: string;
    /** Workspace role for users; "system" for scheduled work, which may run internal actions but never approve. */
    readonly role: string;
}
export const userActor = (userId: string, workspaceId: string, role: string): BrainActor => ({ kind: "user", userId, workspaceId, role });
export const systemActor = (workspaceId: string): BrainActor => ({ kind: "system", userId: null, workspaceId, role: "system" });
export const actorId = (actor: BrainActor): string => actor.userId ?? "system";

/** One labelled statement in a result: observed fact, estimate, assumption, recommendation or caveat (FR-INT-003). */
export interface BrainStatement { readonly kind: BrainStatementKind; readonly text: string }

/** Where a statement came from. Every material answer carries these (PRD principle "evidence over prose"). */
export interface BrainEvidence {
    readonly type: "metric" | "dataset" | "analysis" | "document" | "entity" | "rule" | "web" | "workflow" | "approval";
    readonly title: string;
    readonly reference: string;
    readonly freshness?: string | null;
    readonly version?: string | number | null;
    readonly url?: string;
}

/** The headline number a result is about, shown as the assistant's metric card. */
export interface BrainHeadline {
    readonly value: number | null;
    readonly label: string;
    readonly unit: string;
    readonly currency?: string | null;
    readonly delta?: number | null;
    readonly deltaLabel?: string;
    readonly deltaIsPercent?: boolean;
    readonly icon: string;
}

/** JSON with object keys sorted, so equal values always hash equally. */
export function stableStringify(value: unknown): string {
    if (value === undefined) return "null";
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}
export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
export const hashOf = (value: unknown): string => sha256(stableStringify(value));

export const round = (value: number, digits = 2): number => {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
};

/** Words of a text, lowercased and without punctuation, for keyword relevance. */
export function tokens(text: string): string[] {
    return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9%]+/).filter(word => word.length > 1);
}

/** Formats a number for statements; currency uses the metric's ISO code when it has one. */
export function formatValue(value: number, unit: string, currency?: string | null): string {
    if (!Number.isFinite(value)) return "n/a";
    const abs = Math.abs(value);
    const compact = abs >= 1_000_000_000 ? `${round(value / 1_000_000_000, 2)}B` : abs >= 1_000_000 ? `${round(value / 1_000_000, 2)}M` : abs >= 10_000 ? `${round(value / 1_000, 1)}K` : `${round(value, 2)}`;
    if (unit === "currency") return currency && currency !== "USD" ? `${currency} ${compact}` : `$${compact}`;
    if (unit === "percent") return `${round(value, 2)}%`;
    return compact;
}
export const formatPercent = (value: number): string => `${value >= 0 ? "+" : ""}${round(value, 1)}%`;
