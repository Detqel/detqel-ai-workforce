import { join } from "node:path";

/**
 * Documents are agent replies kept as files: a document an agent was asked to write, or any reply the user
 * exports. Markdown is the source; Word and PDF are rendered from it. Every file lands in the session's
 * artifacts folder on the file server, so a discussion keeps what it produced.
 */
export const DOCUMENT_FORMATS = { markdown: "md", word: "docx", pdf: "pdf" } as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[keyof typeof DOCUMENT_FORMATS];

export const DOCUMENT_MIME_TYPES: Readonly<Record<DocumentFormat, string>> = {
    [DOCUMENT_FORMATS.markdown]: "text/markdown; charset=utf-8",
    [DOCUMENT_FORMATS.word]: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    [DOCUMENT_FORMATS.pdf]: "application/pdf",
};

/** Content types of files kept in a session's artifacts, by extension, for files uploaded or produced there. */
export const ARTIFACT_MIME_TYPES: Readonly<Record<string, string>> = {
    ".md": DOCUMENT_MIME_TYPES.md,
    ".docx": DOCUMENT_MIME_TYPES.docx,
    ".pdf": DOCUMENT_MIME_TYPES.pdf,
    ".txt": "text/plain; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".json": "application/json",
    ".doc": "application/msword",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
};
export const ARTIFACT_DEFAULT_MIME_TYPE = "application/octet-stream";

export const DOCUMENT_LIMITS = {
    /** File names are built from titles; long titles are shortened to keep paths portable. */
    maxFileStemCharacters: 80,
    /** Same-named documents get a numbered suffix; past this the save fails instead of looping. */
    maxNameAttempts: 100,
    /**
     * Uploads travel as base64 inside JSON through the desktop bridge, whose request limit is 1 MiB, so the raw
     * file must stay well under it.
     */
    maxUploadBytes: 700 * 1024,
    maxTitleCharacters: 160,
} as const;

/** Layout of exported PDF pages, in PDF points. */
export const PDF_LAYOUT = {
    pageSize: "A4",
    margin: 56,
    fontSize: { body: 10.5, small: 8.5, code: 9, heading: [20, 16, 13.5, 12, 11, 10.5] as readonly number[] },
    lineGap: 2.5,
    paragraphGap: 7,
    listIndent: 16,
    quoteIndent: 14,
    cellPadding: 5,
    codePadding: 8,
    colors: { text: "#0f172a", muted: "#64748b", rule: "#cbd5e1", codeBackground: "#f1f5f9", tableHeader: "#f8fafc", link: "#6d28d9", quoteBar: "#a78bfa" },
} as const;

/** Exported Word documents use these fonts; Word substitutes when one is missing, so no font file is needed. */
export const DOCX_FONTS = { body: "Calibri", code: "Consolas", math: "Cambria Math" } as const;
export const DOCX_LAYOUT = { bodySizeHalfPoints: 21, codeSizeHalfPoints: 18, smallSizeHalfPoints: 17, mutedColor: "64748B", ruleColor: "CBD5E1", codeShading: "F1F5F9", headerShading: "F8FAFC" } as const;

/**
 * PDF needs a real font file for text beyond basic Latin (arrows, ₹, Greek, accented names). The operating
 * system's own UI fonts are used, resolved per platform; the first file that exists for each style is taken.
 */
export function pdfFontCandidates(platform: NodeJS.Platform, environment: NodeJS.ProcessEnv): Readonly<Record<"regular" | "bold" | "italic" | "mono", readonly string[]>> {
    if (platform === "win32") {
        const fonts = environment.SystemRoot ? join(environment.SystemRoot, "Fonts") : null;
        const at = (...names: string[]) => (fonts ? names.map(name => join(fonts, name)) : []);
        return { regular: at("segoeui.ttf", "arial.ttf"), bold: at("segoeuib.ttf", "arialbd.ttf"), italic: at("segoeuii.ttf", "ariali.ttf"), mono: at("consola.ttf", "cour.ttf") };
    }
    if (platform === "darwin") {
        const supplemental = "/System/Library/Fonts/Supplemental";
        return {
            regular: [join(supplemental, "Arial.ttf")],
            bold: [join(supplemental, "Arial Bold.ttf")],
            italic: [join(supplemental, "Arial Italic.ttf")],
            mono: [join(supplemental, "Courier New.ttf")],
        };
    }
    const roots = ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu", "/usr/share/fonts/TTF"];
    const at = (name: string) => roots.map(root => join(root, name));
    return { regular: at("DejaVuSans.ttf"), bold: at("DejaVuSans-Bold.ttf"), italic: at("DejaVuSans-Oblique.ttf"), mono: at("DejaVuSansMono.ttf") };
}

export const DOCUMENT_ERRORS = {
    noPdfFont: "No system font was found for PDF export on this computer.",
    unknownFormat: "That export format is not supported.",
    emptyDocument: "There is nothing in this reply to export.",
    uploadTooLarge: "This file is too large to add here. Files up to 700 KB can be added to a discussion's artifacts.",
    messageNotFound: "The reply to export was not found in this discussion.",
    namesExhausted: "Too many documents with this name already exist in this discussion.",
} as const;

/** The footer line every exported file carries. */
export const DOCUMENT_ATTRIBUTION = "Exported from DETQEL Kin";
