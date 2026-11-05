import type { FastifyRequest } from "fastify";
import { AppError } from "../errors/app-error.js";

declare module "fastify" {
    interface FastifyRequest {
        /** Set by the API authentication hook for every non-public route. */
        userId?: string;
    }
    interface FastifyContextConfig {
        /** Routes that must be reachable without a session (sign in, register). */
        public?: boolean;
    }
}

/** The authenticated user. Routes behind the authentication hook always have one. */
export function requireUserId(request: FastifyRequest): string {
    if (!request.userId) throw new AppError(401, "Sign in to continue");
    return request.userId;
}

/**
 * Resolves who is performing an action. Clients may still send their own id for compatibility, but a
 * different id is refused so one user cannot record actions as another.
 */
export function actingUser(request: FastifyRequest, claimed?: string | null): string {
    const userId = requireUserId(request);
    if (claimed && claimed !== userId) throw new AppError(403, "You cannot act on behalf of another user");
    return userId;
}
