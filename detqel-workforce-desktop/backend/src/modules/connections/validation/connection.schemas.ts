import { CONNECTION_FIELD_LIMITS } from "../../../constants/connectionConstants.js";
import { z } from "zod";
export const createConnectionSchema = z.object({
    workspaceId: z.string().uuid(),
    catalogId: z.string().uuid(),
    name: z.string().trim().min(1).max(CONNECTION_FIELD_LIMITS.name),
    dataStream: z.string().trim().max(CONNECTION_FIELD_LIMITS.dataStream).nullable().optional(),
    configuration: z.record(z.unknown()),
}).strict();

export const testConnectionSchema = createConnectionSchema.omit({ dataStream: true });

export const updateConnectionSchema = z.object({
    name: z.string().trim().min(1).max(CONNECTION_FIELD_LIMITS.name).optional(),
    dataStream: z.string().trim().max(CONNECTION_FIELD_LIMITS.dataStream).nullable().optional(),
    configuration: z.record(z.unknown()).optional(),
}).strict()
    .refine(value => Object.keys(value).length > 0, "At least one field is required");

export const catalogQuerySchema = z.object({
    workspaceId: z.string().uuid(),
    connectorType: z.string().trim().min(1).max(CONNECTION_FIELD_LIMITS.connectorType).optional(),
    category: z.string().trim().min(1).max(CONNECTION_FIELD_LIMITS.category).optional(),
});

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;
