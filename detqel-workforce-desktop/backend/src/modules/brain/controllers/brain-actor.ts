import type { FastifyRequest } from "fastify";
import { AppError } from "../../../shared/errors/app-error.js";
import type { BrainActor } from "../services/brain-types.js";

declare module "fastify" {
    interface FastifyRequest {
        /** Set by the Business Brain route guard from the verified session and the caller's workspace role. */
        brainActor?: BrainActor;
    }
}

/** The verified actor for a Business Brain request. Tenant and role never come from the request body. */
export function actorOf(request: FastifyRequest): BrainActor {
    if (!request.brainActor) throw new AppError(401, "Sign in to continue");
    return request.brainActor;
}
