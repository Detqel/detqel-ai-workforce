import { z } from "zod";
import {
    DISCUSSION_CAPABILITY_MODES,
    DISCUSSION_LIMITS,
    DISCUSSION_RESPONSE_MODES,
} from "../../../constants/discussionConstants.js";

/** A session is with exactly one recruited agent or one team; the service enforces which. */
export const createSessionSchema = z.object({
    workspaceId: z.string().uuid(),
    title: z.string().min(1).max(255).optional(),
    agentId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
}).strict();

export const sessionIdParamsSchema = z.object({ sessionId: z.string().uuid() });

export const postMessageSchema = z.object({
    message: z.string().min(1).max(DISCUSSION_LIMITS.maxMessageCharacters),
    responseMode: z.enum([DISCUSSION_RESPONSE_MODES.brief, DISCUSSION_RESPONSE_MODES.detailed]).default(DISCUSSION_RESPONSE_MODES.detailed),
    capabilityMode: z.enum([DISCUSSION_CAPABILITY_MODES.fast, DISCUSSION_CAPABILITY_MODES.expert]).default(DISCUSSION_CAPABILITY_MODES.fast),
    webEnabled: z.boolean().default(false),
}).strict();

export const attachConnectorSchema = z.object({
    connectionId: z.string().uuid(),
}).strict();

export const connectorParamsSchema = z.object({
    sessionId: z.string().uuid(),
    connectionId: z.string().uuid(),
});

export const addKnowledgeSchema = z.object({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(255),
    // Text content of the uploaded document, base64 or raw UTF-8 handled by the controller.
    content: z.string().min(1),
    encoding: z.enum(["utf8", "base64"]).default("utf8"),
}).strict();
