import { POML_COMPONENTS, POML_ROOT_TAG } from "../../../constants/pomlConstants.js";

/** XML-escapes a value so it is safe to interpolate into POML source. */
export function escapePoml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export interface AgentPomlFields {
    readonly role: string;
    readonly purpose?: string | null;
    readonly instructions?: string | null;
    readonly context?: string | null;
}

/** Text compared for duplication: case and whitespace differences do not make two sections distinct. */
const comparable = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase();

/**
 * Builds POML source for an agent persona. Empty sections are omitted, and a section repeating an earlier one
 * (a template whose description matches its summary, for example) is dropped, since it would be sent to the
 * model with every call and add tokens without adding meaning.
 */
export function buildAgentPoml(fields: AgentPomlFields): string {
    const sections: Array<[string, string | null | undefined]> = [
        [POML_COMPONENTS.role, fields.role],
        [POML_COMPONENTS.purpose, fields.purpose],
        [POML_COMPONENTS.context, fields.context],
        [POML_COMPONENTS.instructions, fields.instructions],
    ];
    const seen = new Set<string>();
    const body = sections
        .filter((entry): entry is [string, string] => {
            if (typeof entry[1] !== "string" || entry[1].trim().length === 0) return false;
            const key = comparable(entry[1]);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .map(([tag, value]) => `  <${tag}>${escapePoml(value.trim())}</${tag}>`)
        .join("\n");
    return `<${POML_ROOT_TAG}>\n${body}\n</${POML_ROOT_TAG}>\n`;
}
