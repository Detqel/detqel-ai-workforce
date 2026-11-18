import { Lexer } from "marked";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";
import { DOCUMENT_RENDER_LIMITS } from "../../constants/documentImageConstants.js";

const figureSchema = z.object({
    prompt: z.string().trim().min(20).max(DOCUMENT_RENDER_LIMITS.imagePromptCharacters),
    caption: z.string().trim().min(1).max(500),
    aspectRatio: z.enum(["3:2", "1:1", "2:3"]),
}).strict();

export function documentImageRequests(markdown: string) {
    return new Lexer({ gfm: true }).lex(markdown).filter(token => token.type === "code" && token.lang === "image").map(token => {
        try { return { raw: token.raw, ...figureSchema.parse(JSON.parse((token as { text: string }).text)) }; }
        catch { throw new AppError(422, "A required image has invalid generation instructions."); }
    });
}

const normalizeHeading = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Run before image generation, and again at artifact creation; model claims alone cannot mark it complete. */
export function documentRequirementIssues(markdown: string, request: { imageCount?: number; requiredSections?: ReadonlyArray<string> }): string[] {
    const tokens = new Lexer({ gfm: true }).lex(markdown);
    const issues: string[] = [];
    for (const title of request.requiredSections ?? []) {
        const index = tokens.findIndex(token => token.type === "heading" && normalizeHeading(token.text) === normalizeHeading(title));
        if (index < 0) { issues.push(`Missing required section: ${title}`); continue; }
        const heading = tokens[index];
        const depth = heading.type === "heading" ? heading.depth : 6;
        let body = "";
        for (let next = index + 1; next < tokens.length; next++) {
            const token = tokens[next];
            if (token.type === "heading" && token.depth <= depth) break;
            body += token.raw;
        }
        if (body.trim().length < 40) issues.push(`Required section has no substantive content: ${title}`);
    }
    try {
        const figures = documentImageRequests(markdown);
        if (figures.length < (request.imageCount ?? 0)) issues.push(`Expected at least ${request.imageCount} original images; found ${figures.length} generation requests.`);
        if (figures.length > DOCUMENT_RENDER_LIMITS.figures) issues.push("Too many generated figures for one document.");
    } catch { issues.push("Image requests must be standalone image code blocks containing valid prompt, caption and aspectRatio JSON."); }
    if ((request.imageCount ?? 0) > 0 && tokens.some(token => token.type === "code" && /^(mermaid|plantuml|dot|graphviz)$/i.test(token.lang ?? ""))) {
        issues.push("Diagram source code does not satisfy the requested images. Replace it with an actual image generation request.");
    }
    return issues;
}
