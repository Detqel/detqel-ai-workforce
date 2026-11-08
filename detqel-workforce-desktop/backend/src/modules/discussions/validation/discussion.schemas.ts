import { z } from "zod";
import {
    DISCUSSION_CAPABILITY_MODES,
    DISCUSSION_LIMITS,
    DISCUSSION_RESPONSE_MODES,
} from "../../../constants/discussionConstants.js";
import { DOCUMENT_FORMATS, DOCUMENT_LIMITS } from "../../../constants/documentConstants.js";

/** A session is with exactly one recruited agent or one team; the service enforces which. */
export const createSessionSchema = z.object({
    workspaceId: z.string().uuid(),
    title: z.string().min(1).max(255).optional(),
    agentId: z.string().uuid().optional(),
    teamId: z.string().uuid().optional(),
}).strict();

export const sessionIdParamsSchema = z.object({ sessionId: z.string().uuid() });

export const renameSessionSchema = z.object({
    title: z.string().trim().min(1).max(255),
}).strict();

export const messageParamsSchema = z.object({ sessionId: z.string().uuid(), messageId: z.string().uuid() });

export const artifactParamsSchema = z.object({ sessionId: z.string().uuid(), fileName: z.string().min(1).max(255) });

export const exportSchema = z.object({
    format: z.enum([DOCUMENT_FORMATS.markdown, DOCUMENT_FORMATS.word, DOCUMENT_FORMATS.pdf]),
}).strict();

export const uploadArtifactSchema = z.object({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1).max(255),
    // Base64, so any file type survives the JSON request; the decoded size is limited by the service.
    contentBase64: z.string().min(1).max(Math.ceil(DOCUMENT_LIMITS.maxUploadBytes / 3) * 4 + 4),
}).strict();

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
