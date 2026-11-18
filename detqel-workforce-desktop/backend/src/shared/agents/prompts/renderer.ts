import { AppError } from "../../errors/app-error.js";
import { PROMPT_ERRORS, PROMPT_MAX_FILE_BYTES, PROMPT_MAX_RENDER_CHARACTERS } from "../../../constants/promptConstants.js";

export function validatePrompt(source: string): void {
    if (!source.trim() || !source.replace(/<!--[\s\S]*?-->/g, "").trim()) throw new AppError(422, PROMPT_ERRORS.empty);
    if (source.includes("\0") || Buffer.byteLength(source, "utf8") > PROMPT_MAX_FILE_BYTES) throw new AppError(422, PROMPT_ERRORS.oversized);
}

/** One literal substitution pass; values never become templates or executable markup. */
export function applyTemplate(source: string, variables: Readonly<Record<string, string>>): string {
    const rendered = source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_whole, name: string) => {
        if (!Object.prototype.hasOwnProperty.call(variables, name)) throw new AppError(400, `${PROMPT_ERRORS.unresolvedVariable} (${name})`);
        return variables[name];
    });
    if (rendered.length > PROMPT_MAX_RENDER_CHARACTERS) throw new AppError(422, PROMPT_ERRORS.oversized);
    return rendered;
}

export function renderMarkdownPrompt(source: string, variables?: Readonly<Record<string, string>>): string {
    validatePrompt(source);
    const instructions = source.replace(/<!--[\s\S]*?-->/g, "").trim();
    return variables === undefined ? instructions : applyTemplate(instructions, variables);
}
