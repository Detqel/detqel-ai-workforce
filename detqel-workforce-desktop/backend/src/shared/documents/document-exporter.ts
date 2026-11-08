import { AppError } from "../errors/app-error.js";
import { DOCUMENT_ATTRIBUTION, DOCUMENT_ERRORS, DOCUMENT_FORMATS, DOCUMENT_MIME_TYPES, type DocumentFormat } from "../../constants/documentConstants.js";
import { parseMarkdown, plainText } from "./markdown-model.js";
import { renderDocx } from "./docx-renderer.js";
import { renderPdf } from "./pdf-renderer.js";

/** What a document is and who wrote it, shown on the first page and in the file's properties. */
export interface DocumentInfo {
    readonly title: string;
    /** For example "Aiden · Chief Technology Officer · DETQEL CORE". */
    readonly subtitle: string;
    readonly author: string;
    /** When it was exported, already formatted for display. */
    readonly exportedAt: string;
}

export interface ExportedFile {
    readonly contents: Buffer;
    readonly mimeType: string;
    readonly extension: DocumentFormat;
}

export function isDocumentFormat(value: string): value is DocumentFormat {
    return (Object.values(DOCUMENT_FORMATS) as string[]).includes(value);
}

/** Converts a Markdown reply into a Markdown, Word, or PDF file. */
export class DocumentExporter {
    async export(format: DocumentFormat, info: DocumentInfo, markdown: string): Promise<ExportedFile> {
        if (!markdown.trim()) throw new AppError(400, DOCUMENT_ERRORS.emptyDocument);
        if (format === DOCUMENT_FORMATS.markdown) {
            // The Markdown file is the reply as written, with a short header naming where it came from.
            // "--" would end the comment early, so names containing it cannot break out of it.
            const header = `<!-- ${`${DOCUMENT_ATTRIBUTION} · ${info.subtitle} · ${info.exportedAt}`.replaceAll("--", "—")} -->\n\n`;
            return { contents: Buffer.from(header + markdown.trim() + "\n", "utf8"), mimeType: DOCUMENT_MIME_TYPES.md, extension: format };
        }
        const blocks = parseMarkdown(markdown);
        // A reply that opens with its own title heading would otherwise show the title twice.
        const first = blocks[0];
        const content = first?.type === "heading" && plainText(first.runs).trim().toLowerCase() === info.title.trim().toLowerCase() ? blocks.slice(1) : blocks;
        if (format === DOCUMENT_FORMATS.word) return { contents: await renderDocx(info, content), mimeType: DOCUMENT_MIME_TYPES.docx, extension: format };
        if (format === DOCUMENT_FORMATS.pdf) return { contents: await renderPdf(info, content), mimeType: DOCUMENT_MIME_TYPES.pdf, extension: format };
        throw new AppError(400, DOCUMENT_ERRORS.unknownFormat);
    }
}
