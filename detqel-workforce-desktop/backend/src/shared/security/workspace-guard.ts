import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import type { WorkspaceAccess } from "../../modules/workspaces/services/workspace-access.service.js";
import { requireUserId } from "./request-context.js";

/** Finds the workspace a request refers to, either from its own fields or by looking up the resource it names. */
export type WorkspaceLocator = (request: FastifyRequest) => string | Promise<string>;

const uuid = z.string().uuid();
const fromField = (source: (request: FastifyRequest) => unknown, name: string): WorkspaceLocator =>
    request => z.object({ [name]: uuid }).parse(source(request) ?? {})[name] as string;

export const workspaceFromQuery = (name = "workspaceId"): WorkspaceLocator => fromField(request => request.query, name);
export const workspaceFromBody = (name = "workspaceId"): WorkspaceLocator => fromField(request => request.body, name);
export const workspaceFromParams = (name = "workspaceId"): WorkspaceLocator => fromField(request => request.params, name);

const optionalField = (source: (request: FastifyRequest) => unknown, name: string) =>
    (request: FastifyRequest): string | undefined => z.object({ [name]: uuid.optional() }).passthrough().parse(source(request) ?? {})[name] as string | undefined;
export const optionalWorkspaceFromQuery = (name = "workspaceId") => optionalField(request => request.query, name);
export const optionalWorkspaceFromBody = (name = "workspaceId") => optionalField(request => request.body, name);

/** Reads the route's `:id` parameter, validated, for locators that resolve a resource to its workspace. */
export const idParam = (request: FastifyRequest, name = "id"): string => uuid.parse((request.params as Record<string, unknown> | undefined)?.[name]);

export function createRouteGuards(app: FastifyInstance) {
    return {
        /** Requires the signed-in user to hold `access` in the workspace the locator resolves for the request. */
        workspace: (access: WorkspaceAccess, locate: WorkspaceLocator): preHandlerAsyncHookHandler => async request => {
            await app.services.workspaceAccess.authorize(requireUserId(request), await locate(request), access);
        },
        /** Requires the signed-in user to administer at least one workspace (for installation-wide settings). */
        administrator: (): preHandlerAsyncHookHandler => async request => {
            await app.services.workspaceAccess.requireAdministrator(requireUserId(request));
        },
        /**
         * For operations that use stored provider credentials. When the request names a workspace the caller must
         * manage that workspace; otherwise they must administer at least one workspace.
         */
        credentialUse: (locate: (request: FastifyRequest) => string | undefined): preHandlerAsyncHookHandler => async request => {
            const userId = requireUserId(request);
            const workspaceId = locate(request);
            if (workspaceId) await app.services.workspaceAccess.authorize(userId, workspaceId, "manage");
            else await app.services.workspaceAccess.requireAdministrator(userId);
        },
    };
}
