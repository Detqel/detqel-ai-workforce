import { z } from "zod";

export const lookupParamsSchema = z.object({ resource: z.string().min(1).max(100) });
export const lookupItemParamsSchema = lookupParamsSchema.extend({ id: z.string().uuid() });
export const createLookupSchema = z.object({
    code: z.string().trim().min(1).max(50).regex(/^[a-z][a-z0-9_-]*$/),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).nullable().optional(),
    sortOrder: z.number().int().min(0).max(2147483647).default(0),
}).strict();
export const updateLookupSchema = createLookupSchema.partial()
    .refine(value => Object.keys(value).length > 0, "At least one field is required");
