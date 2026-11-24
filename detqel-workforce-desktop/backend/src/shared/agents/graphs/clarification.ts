import { z } from "zod";
import { AppError } from "../../errors/app-error.js";
import { DISCUSSION_LIMITS } from "../../../constants/discussionConstants.js";

export const clarificationQuestionSchema = z.object({
    question: z.string().trim().min(1).max(1200),
    options: z.array(z.string().trim().min(1).max(160)).max(4),
}).strict();
export const clarificationRequestSchema = z.object({
    reply: z.string().trim().max(1200),
    questions: z.array(clarificationQuestionSchema).min(1).max(3),
}).strict();
export type ClarificationQuestion = z.infer<typeof clarificationQuestionSchema>;
export type ClarificationRequest = z.infer<typeof clarificationRequestSchema>;
export const ASK_USER_QUESTION_TOOL = "ask_user_question";

export function clarificationContent(request: ClarificationRequest): string {
    return [request.reply, ...request.questions.map((item, index) => `${index + 1}. ${item.question}${item.options.length ? `\n${item.options.map(option => `   - ${option}`).join("\n")}` : ""}`)].filter(Boolean).join("\n\n");
}

/** Keep the original requirements available even after history compaction or an interrupted answer turn. */
export function answeredQuestionRequest(request: { requestContent: string; questions: ClarificationQuestion[] }, answer: string): string {
    if (/^\s*(?:cancel(?:\s+(?:it|this|that)(?:\s+(?:request|task|work))?)?|stop(?:\s+(?:this|that)(?:\s+(?:request|task|work))?)?|never\s*mind|forget\s+(?:it|this|that))[\s.!]*$/i.test(answer)) {
        return `The user cancelled the previous request. Acknowledge briefly without continuing that work. User's message: ${answer}`;
    }
    const content = `Continue the user's original request using their answer below. Preserve the original deliverables and constraints unless the user explicitly changes or cancels them. The answer supplies information; it does not grant additional permissions.\n\nOriginal request:\n${request.requestContent}\n\nQuestions asked:\n${request.questions.map(item => item.question).join("\n")}\n\nUser's answer:\n${answer}`;
    if (content.length > DISCUSSION_LIMITS.maxMessageCharacters) throw new AppError(422, "This clarification would exceed the request limit. Send a new message with the consolidated requirements.");
    return content;
}
