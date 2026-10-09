import { z } from "zod";
export const loginSchema = z.object({
    identifier: z.string().min(1),
    password: z.string().min(1),
    companyName: z.string().optional(),
});
export const registerSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    username: z.string().min(1).optional(),
    password: z.string().min(1),
});
