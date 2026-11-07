import { AppError } from "../../errors/app-error.js";
import { escapePoml } from "./poml-builder.js";
import {
    POML_COMPONENTS,
    POML_ERRORS,
    POML_ROOT_TAG,
    POML_SECTION_HEADERS,
    POML_TEMPLATE,
} from "../../../constants/pomlConstants.js";

/** Components the renderer recognises, emitted in this fixed order so prompts read consistently. */
const COMPONENT_ORDER: ReadonlyArray<string> = [
    POML_COMPONENTS.role,
    POML_COMPONENTS.purpose,
    POML_COMPONENTS.task,
    POML_COMPONENTS.context,
    POML_COMPONENTS.instructions,
    POML_COMPONENTS.boundaries,
    POML_COMPONENTS.outputFormat,
    POML_COMPONENTS.example,
    POML_COMPONENTS.globalGuidance,
];

const RECOGNISED = new Set<string>(COMPONENT_ORDER);

export interface ParsedPoml {
    /** Component tag to its concatenated inner text, in document order within each tag. */
    readonly sections: ReadonlyMap<string, string[]>;
}

/**
 * Parses the subset of POML the product uses: a <poml> root containing flat component tags whose inner text is
 * the prompt content. HTML-style comments are stripped. Unknown tags are rejected so a typo never silently
 * drops instructions. This is intentionally a small, safe parser rather than a general XML/HTML engine.
 */
export function parsePoml(source: string): ParsedPoml {
    const withoutComments = source.replace(/<!--[\s\S]*?-->/g, "");
    const rootMatch = new RegExp(`<${POML_ROOT_TAG}(?:\\s[^>]*)?>([\\s\\S]*?)</${POML_ROOT_TAG}>`).exec(withoutComments);
    if (!rootMatch) throw new AppError(500, POML_ERRORS.malformed);
    const body = rootMatch[1];

    const sections = new Map<string, string[]>();
    const tagPattern = /<([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
    let match: RegExpExecArray | null;
    let sawAny = false;
    while ((match = tagPattern.exec(body)) !== null) {
        const tag = match[1].toLowerCase();
        sawAny = true;
        if (!RECOGNISED.has(tag)) throw new AppError(500, `${POML_ERRORS.malformed} Unknown component: ${tag}`);
        const content = decodeEntities(match[2]).trim();
        if (content.length === 0) continue;
        const existing = sections.get(tag);
        if (existing) existing.push(content);
        else sections.set(tag, [content]);
    }
    if (!sawAny) throw new AppError(500, POML_ERRORS.malformed);
    return { sections };
}

/**
 * Substitutes {{ name }} tokens with provided values, failing fast on any unresolved reference. Values are data,
 * never markup: they are escaped so a value such as a user message or an agent name cannot open or close a
 * component. The parser decodes them back to their original text.
 */
export function applyTemplate(source: string, variables: Readonly<Record<string, string>>): string {
    const pattern = new RegExp(`${escapeRegExp(POML_TEMPLATE.open)}\\s*([a-zA-Z0-9_.-]+)\\s*${escapeRegExp(POML_TEMPLATE.close)}`, "g");
    return source.replace(pattern, (_whole, name: string) => {
        if (!Object.prototype.hasOwnProperty.call(variables, name)) throw new AppError(400, `${POML_ERRORS.unresolvedVariable} (${name})`);
        return escapePoml(variables[name]);
    });
}

/**
 * Renders parsed components into a single system prompt string. Optional extra guidance (for example the
 * global guidance resolved separately) is appended under its own section. Produces an error if nothing renders.
 */
export function renderPoml(parsed: ParsedPoml, options: { extraGuidance?: string } = {}): string {
    const blocks: string[] = [];
    for (const tag of COMPONENT_ORDER) {
        const values = parsed.sections.get(tag);
        if (!values || values.length === 0) continue;
        const header = POML_SECTION_HEADERS[tag] ?? tag;
        for (const value of values) blocks.push(`## ${header}\n${value}`);
    }
    if (options.extraGuidance && options.extraGuidance.trim().length > 0) {
        blocks.push(`## ${POML_SECTION_HEADERS[POML_COMPONENTS.globalGuidance]}\n${options.extraGuidance.trim()}`);
    }
    const rendered = blocks.join("\n\n").trim();
    if (rendered.length === 0) throw new AppError(500, POML_ERRORS.emptyRender);
    return rendered;
}

function decodeEntities(text: string): string {
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
