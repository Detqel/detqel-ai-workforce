import { z } from "zod";
export const createConnectionSchema = z.object({
    workspaceId: z.string().uuid(),
    name: z.string().min(1),
    provider: z.string().min(1),
    connectionType: z.enum(["database", "api", "file", "saas", "mcp", "other"]),
    configuration: z.record(z.unknown()).default({}),
    credentialReference: z.string().optional(),
});
