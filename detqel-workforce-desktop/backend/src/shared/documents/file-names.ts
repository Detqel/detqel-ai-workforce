import { DOCUMENT_LIMITS } from "../../constants/documentConstants.js";

// Characters no file system accepts in a name, plus control characters.
const UNSAFE = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * A portable file name stem built from the first title that still has letters or digits once unsafe characters
 * are removed. Leading dots are dropped so a name can never be hidden or relative.
 */
export function fileStem(...titles: ReadonlyArray<string>): string | null {
    for (const title of titles) {
        const stem = title.replace(UNSAFE, " ").replace(/\s+/g, " ").replace(/^[.\s]+/, "").trim().slice(0, DOCUMENT_LIMITS.maxFileStemCharacters).trim();
        if (/[\p{L}\p{N}]/u.test(stem)) return stem;
    }
    return null;
}

/** Candidate names for a new file: "Title.md", then "Title (2).md", "Title (3).md", and so on. */
export function* numberedNames(stem: string, extension: string): Generator<string> {
    yield `${stem}.${extension}`;
    for (let index = 2; index <= DOCUMENT_LIMITS.maxNameAttempts; index++) yield `${stem} (${index}).${extension}`;
}
