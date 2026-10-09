import { z } from "zod";
export const profileSchema = z.object({
    businessName: z.string().min(1),
    businessType: z.string().optional(),
    industry: z.string().optional(),
    description: z.string().optional(),
    productsServices: z.array(z.unknown()).default([]),
    customers: z.array(z.unknown()).default([]),
    departments: z.array(z.unknown()).default([]),
    locations: z.array(z.unknown()).default([]),
    businessModel: z.record(z.unknown()).optional(),
});
export const knowledgeSchema = z.object({
    title: z.string().min(1),
    content: z.string().min(1),
    sourceType: z.enum(["document", "manual", "url", "import", "other"]).default("manual"),
    sourceReference: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
});
export const goalSchema = z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    goalType: z.enum(["revenue", "growth", "cost", "efficiency", "customer", "operations", "other"]),
    targetValue: z.number().optional(),
    currentValue: z.number().optional(),
    targetDate: z.string().datetime().optional().transform((d) => (d ? new Date(d) : undefined)),
    priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});
export const ruleSchema = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    ruleType: z.enum(["policy", "constraint", "approval", "operational", "financial", "custom"]),
    ruleDefinition: z.record(z.unknown()),
});
export const stateSchema = z.object({
    stateType: z.enum([
        "financial",
        "sales",
        "customer",
        "operations",
        "marketing",
        "inventory",
        "workforce",
        "overall",
        "custom",
    ]),
    stateData: z.record(z.unknown()),
    confidence: z.number().optional(),
    sourceCount: z.number().default(1),
    expiresAt: z.string().datetime().optional().transform((d) => (d ? new Date(d) : undefined)),
});
export const memorySchema = z.object({
    memoryType: z.enum(["decision", "event", "finding", "preference", "lesson", "outcome", "fact"]),
    title: z.string().min(1),
    content: z.string().min(1),
    sourceMissionId: z.string().uuid().optional(),
    importance: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    metadata: z.record(z.unknown()).optional(),
});
