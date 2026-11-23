import { createHash } from "node:crypto";
import { z } from "zod";
import type { TaskExecutionPlan } from "./task-plan.js";

type Requirement = TaskExecutionPlan["requirements"][number];
type ProtocolIssue = "invalid_json" | "invalid_schema" | "missing_evidence";

/** Evidence addresses belong to the server; the reviewer never has to reproduce Markdown verbatim. */
export function requirementVerification(requirements: ReadonlyArray<Requirement>, candidate: string) {
    const lines = candidate.split(/\r\n|\n|\r/);
    const check = z.object({
        satisfied: z.boolean(),
        evidenceLines: z.array(z.number().int().min(1).max(lines.length)).max(8),
        reason: z.string().trim().min(1).max(300),
    }).strict();
    const schema = z.object({ checks: z.object(Object.fromEntries(requirements.map(item => [item.id, check]))).strict() }).strict();
    return {
        candidateHash: createHash("sha256").update(candidate).digest("hex"),
        responseSchema: { name: "requirement_verification", schema: z.toJSONSchema(schema) },
        evidence: JSON.stringify(lines.map((text, index) => ({ line: index + 1, text }))),
        parse(content: string): { checks: Array<{ id: string; satisfied: boolean; reason: string }> } | { issues: ProtocolIssue[]; fields?: Array<{ code: string; path: string }> } {
            let value: unknown;
            try { value = JSON.parse(content); } catch { return { issues: ["invalid_json"] }; }
            const parsed = schema.safeParse(value);
            if (!parsed.success) {
                const allowed = new Set(["checks", "satisfied", "evidenceLines", "reason", ...requirements.map(item => item.id)]);
                return { issues: ["invalid_schema"], fields: parsed.error.issues.slice(0, 12).map(issue => ({ code: issue.code,
                    path: issue.path.map(part => typeof part === "number" ? "[]" : allowed.has(String(part)) ? String(part) : "unknown_field").join(".") })) };
            }
            const issues = new Set<ProtocolIssue>();
            const checks = requirements.map(requirement => {
                const result = parsed.data.checks[requirement.id];
                // Duplicate addresses and blank lines convey no evidence, but are not content defects.
                const evidence = new Set(result.evidenceLines.filter(line => lines[line - 1].trim()));
                if (result.satisfied && !evidence.size) issues.add("missing_evidence");
                return { id: requirement.id, satisfied: result.satisfied, reason: result.reason };
            });
            return issues.size ? { issues: [...issues] } : { checks };
        },
    };
}
