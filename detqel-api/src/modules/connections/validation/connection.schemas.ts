import { z } from "zod";
export const createConnectionSchema = z.object({
    workspaceId: z.string().uuid(),
    catalogId: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    dataStream: z.string().trim().max(255).nullable().optional(),
    configuration: z.record(z.unknown()),
}).strict();

export const testConnectionSchema = createConnectionSchema.omit({ dataStream: true });

export const updateConnectionSchema = z.object({
    name: z.string().trim().min(1).max(255).optional(),
    dataStream: z.string().trim().max(255).nullable().optional(),
    configuration: z.record(z.unknown()).optional(),
}).strict()
    .refine(value => Object.keys(value).length > 0, "At least one field is required");

export const catalogQuerySchema = z.object({
    workspaceId: z.string().uuid(),
    connectorType: z.string().trim().min(1).max(50).optional(),
    category: z.string().trim().min(1).max(100).optional(),
});

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
