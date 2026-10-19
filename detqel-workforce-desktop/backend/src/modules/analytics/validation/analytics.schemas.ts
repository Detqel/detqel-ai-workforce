import { z } from "zod";
export const createPredictionSchema = z.object({
    workspaceId: z.string().uuid(),
    missionId: z.string().uuid().optional(),
    name: z.string().min(1),
    predictionType: z.string().min(1),
    target: z.string().min(1),
    modelReference: z.string().optional(),
    inputData: z.record(z.unknown()).default({}),
    result: z.record(z.unknown()).default({}),
    confidence: z.number().optional(),
    predictionPeriod: z.record(z.unknown()).optional(),
});
export const createSimulationSchema = z.object({
    workspaceId: z.string().uuid(),
    missionId: z.string().uuid().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    baseline: z.record(z.unknown()).default({}),
    scenario: z.record(z.unknown()).default({}),
    result: z.record(z.unknown()).optional(),
    createdBy: z.string().uuid().optional(),
});
export const recordActivitySchema = z.object({
    workspaceId: z.string().uuid(),
    userId: z.string().uuid().optional(),
    activityType: z.enum([
        "investigations",
        "predictions",
        "simulations",
        "automations",
        "decisions",
    ]),
    title: z.string().min(1),
    description: z.string().optional(),
    entityId: z.string().uuid().optional(),
    entityType: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
});
