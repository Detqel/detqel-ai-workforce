import {
    AGENT_PROTECTED_FILE_PATTERNS,
    AGENT_REDACTION,
    AGENT_SECRET_VALUE_PATTERNS,
    AGENT_SENSITIVE_COLUMN_PATTERN,
    AGENT_UNTRUSTED_DATA,
} from "../../../constants/agentContextConstants.js";

/** True for files that hold credentials or keys. Paths use forward slashes; matching ignores case. */
export function isProtectedFile(path: string): boolean {
    const normalized = path.replace(/\\/g, "/");
    return AGENT_PROTECTED_FILE_PATTERNS.some(pattern => pattern.test(normalized));
}

/** Payment card numbers pass the Luhn check; this keeps order numbers and phone numbers readable. */
function isCardNumber(digits: string): boolean {
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    for (let index = 0; index < digits.length; index++) {
        let digit = Number(digits[digits.length - 1 - index]);
        if (index % 2 === 1) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    return sum % 10 === 0;
}

/** Masks credentials, private keys and payment card numbers in text an agent reads. */
export function redactText(text: string): string {
    let result = text;
    for (const pattern of AGENT_SECRET_VALUE_PATTERNS) {
        result = result.replace(pattern, (match, prefix?: unknown, quote?: unknown) =>
            typeof prefix === "string" && typeof quote === "string" ? `${prefix}${quote}${AGENT_REDACTION}${quote}` : AGENT_REDACTION);
    }
    return result.replace(/\b(?:\d[ -]?){12,18}\d\b/g, match => (isCardNumber(match.replace(/[ -]/g, "")) ? AGENT_REDACTION : match));
}

export function isSensitiveColumn(name: string): boolean {
    const segments = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    return AGENT_SENSITIVE_COLUMN_PATTERN.test(segments);
}

/** Withholds sensitive fields and masks secret-looking values anywhere in a JSON-like value. */
export function redactValue(value: unknown, depth = 0): unknown {
    if (depth > 12) return AGENT_REDACTION;
    if (typeof value === "string") return redactText(value);
    if (Array.isArray(value)) return value.map(item => redactValue(item, depth + 1));
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "bigint") return value.toString();
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `[binary ${value.byteLength} bytes]`;
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, field]) =>
            [key, isSensitiveColumn(key) && field !== null && field !== undefined ? AGENT_REDACTION : redactValue(field, depth + 1)]));
    }
    return value;
}

/** Shortens text to a character budget and says so, so the model knows the result is incomplete. */
export function truncate(text: string, limit: number): { text: string; truncated: boolean } {
    if (text.length <= limit) return { text, truncated: false };
    return { text: `${text.slice(0, limit)}\n[... truncated: ${text.length - limit} more characters not shown]`, truncated: true };
}

/** Attribute values inside the wrapper cannot close it or start a new tag. */
function attribute(value: string): string {
    return value.replace(/[<>"&\r\n]/g, " ").slice(0, 200);
}

/**
 * Wraps a tool result as untrusted data. Anything inside that looks like the closing tag is neutralized, so text
 * from a connector cannot end the block early and pose as instructions.
 */
export function untrusted(source: string, body: string): string {
    const safe = body.replace(/<\/?\s*untrusted_data[^>]*>/gi, "[tag removed]");
    return `${AGENT_UNTRUSTED_DATA.open} source="${attribute(source)}">\n${safe}\n${AGENT_UNTRUSTED_DATA.close}`;
}
