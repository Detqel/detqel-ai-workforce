import { LOOKUP_CODE_PATTERN, LOOKUP_FIELD_LIMITS } from "../../../constants/lookupConstants.js";
import { z } from "zod";

export const lookupParamsSchema = z.object({ resource: z.string().min(1).max(LOOKUP_FIELD_LIMITS.resource) });
export const lookupItemParamsSchema = lookupParamsSchema.extend({ id: z.string().uuid() });
export const createLookupSchema = z.object({
    code: z.string().trim().min(1).max(LOOKUP_FIELD_LIMITS.code).regex(LOOKUP_CODE_PATTERN),
    name: z.string().trim().min(1).max(LOOKUP_FIELD_LIMITS.name),
    description: z.string().trim().max(LOOKUP_FIELD_LIMITS.description).nullable().optional(),
    sortOrder: z.number().int().min(0).max(LOOKUP_FIELD_LIMITS.sortOrder).default(0),
}).strict();
export const updateLookupSchema = createLookupSchema.partial()
    .refine(value => Object.keys(value).length > 0, "At least one field is required");
