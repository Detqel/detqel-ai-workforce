import { z } from "zod";
export const createDomainSchema = z.object({
    name: z.string().trim().min(1, "Domain name is required").max(150),
    description: z.string().optional(),
    isCustom: z.boolean().optional(),
});
