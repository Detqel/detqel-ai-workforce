import { AppError } from "../errors/app-error.js";
import { DOCUMENT_ATTRIBUTION, DOCUMENT_ERRORS, DOCUMENT_FORMATS, DOCUMENT_MIME_TYPES, type DocumentFormat } from "../../constants/documentConstants.js";
import { parseMarkdown, plainText } from "./markdown-model.js";
import { renderDocx } from "./docx-renderer.js";
import { renderPdf } from "./pdf-renderer.js";
import { Lexer } from "marked";
import { z } from "zod";
import { createHash } from "node:crypto";
import { DOCUMENT_IMAGE_ERRORS, DOCUMENT_RENDER_LIMITS } from "../../constants/documentImageConstants.js";
import { prepareDocumentVisuals, type DocumentAssetResolver } from "./document-visuals.js";
import type { DocumentImageService } from "./document-image.service.js";
import { addUsage, ZERO_USAGE } from "../agents/graphs/discussion-runtime.js";

const imageRequestSchema = z.object({
    prompt: z.string().trim().min(20).max(DOCUMENT_RENDER_LIMITS.imagePromptCharacters),
    caption: z.string().trim().min(1).max(500),
    aspectRatio: z.enum(["3:2", "1:1", "2:3"]),
}).strict();

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
    constructor(private readonly images?: DocumentImageService) {}

    imageCapability(workspaceId: string) {
        if (!this.images) throw new AppError(503, "The document image service is not configured.");
        return this.images.capability(workspaceId);
    }

    /** Complete assets and preflight both delivery formats before the document is handed over. */
    async createDocument(info: DocumentInfo, draft: string, options: {
        workspaceId: string; imageCount: number; signal?: AbortSignal;
        storeAsset: (contents: Buffer) => Promise<string>; resolveAsset: DocumentAssetResolver;
    }) {
        if (draft.length > DOCUMENT_RENDER_LIMITS.markdownCharacters) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge);
        const requests = new Lexer({ gfm: true }).lex(draft).filter(token => token.type === "code" && token.lang === "image").map(token => {
            try { return { raw: token.raw, ...imageRequestSchema.parse(JSON.parse((token as { text: string }).text)) }; }
            catch { throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidDocument); }
        });
        if (requests.length < options.imageCount || requests.length > DOCUMENT_RENDER_LIMITS.figures) throw new AppError(422, "The document does not contain the required image instructions. It was not saved as a text-only substitute.");
        if (requests.length && !this.images) throw new AppError(503, DOCUMENT_IMAGE_ERRORS.generationFailed);
        const controller = new AbortController();
        const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
        const generated: Array<Awaited<ReturnType<DocumentImageService["generate"]>>> = [];
        let generatedBytes = 0;
        let next = 0;
        const workers = Array.from({ length: Math.min(2, requests.length) }, async () => {
            while (next < requests.length) {
                signal.throwIfAborted();
                const index = next++;
                const request = requests[index];
                const prompt = "Create a finished, publication-quality figure for a professional document. Preserve factual accuracy, clear visual hierarchy, legible labels, generous spacing, and a consistent restrained palette. Do not invent numerical data. Do not draw a document page or use Markdown, ASCII, watermarks, or placeholder text. Figure brief: " + request.prompt;
                generated[index] = await this.images!.generate(options.workspaceId, prompt, request.aspectRatio, signal);
                generatedBytes += generated[index].contents.length;
                if (generatedBytes > DOCUMENT_RENDER_LIMITS.documentImageBytes) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge);
            }
        });
        try { await Promise.all(workers); }
        catch (error) { controller.abort(); await Promise.allSettled(workers); throw error; }
        let markdown = draft;
        let usage = ZERO_USAGE;
        const pending = new Map<string, Buffer>();
        for (let index = 0; index < requests.length; index++) {
            const image = generated[index];
            usage = addUsage(usage, image.usage);
            const source = "kin-asset:" + createHash("sha256").update(image.contents).digest("hex") + ".png";
            pending.set(source, image.contents);
            const caption = requests[index].caption.replace(/[\[\]\\\r\n]/g, " ");
            markdown = markdown.replace(requests[index].raw, "![" + caption + "](" + source + ")\n\n");
        }
        const resolve: DocumentAssetResolver = async source => pending.get(source) ?? options.resolveAsset(source);
        // Both formats share this exact prepared content, including formula outlines and figure geometry.
        const content = await this.prepare(info, markdown, resolve);
        signal.throwIfAborted();
        await renderDocx(info, content);
        await renderPdf(info, content);
        for (const [expected, contents] of pending) {
            signal.throwIfAborted();
            if (await options.storeAsset(contents) !== expected) throw new AppError(500, DOCUMENT_IMAGE_ERRORS.unavailableAsset);
        }
        return { markdown, usage };
    }

    private async prepare(info: DocumentInfo, markdown: string, resolveAsset?: DocumentAssetResolver) {
        const blocks = parseMarkdown(markdown);
        const first = blocks[0];
        const content = first?.type === "heading" && plainText(first.runs).trim().toLowerCase() === info.title.trim().toLowerCase() ? blocks.slice(1) : blocks;
        return prepareDocumentVisuals(content, resolveAsset);
    }

    async export(format: DocumentFormat, info: DocumentInfo, markdown: string, resolveAsset?: DocumentAssetResolver): Promise<ExportedFile> {
        if (!markdown.trim()) throw new AppError(400, DOCUMENT_ERRORS.emptyDocument);
        const content = await this.prepare(info, markdown, resolveAsset);
        if (format === DOCUMENT_FORMATS.markdown) {
            // The Markdown file is the reply as written, with a short header naming where it came from.
            // "--" would end the comment early, so names containing it cannot break out of it.
            const header = `<!-- ${`${DOCUMENT_ATTRIBUTION} · ${info.subtitle} · ${info.exportedAt}`.replaceAll("--", "—")} -->\n\n`;
            let portable = markdown;
            for (const match of markdown.matchAll(/(!\[[^\]\r\n]*\]\()(kin-asset:[a-f0-9]{64}\.png)(\))/g)) {
                if (!resolveAsset) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.unavailableAsset);
                const bytes = await resolveAsset(match[2]);
                portable = portable.replaceAll(match[0], match[1] + "data:image/png;base64," + bytes.toString("base64") + match[3]);
                if (Buffer.byteLength(portable, "utf8") > DOCUMENT_RENDER_LIMITS.exportBytes) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge);
            }
            return { contents: Buffer.from(header + portable.trim() + "\n", "utf8"), mimeType: DOCUMENT_MIME_TYPES.md, extension: format };
        }
        if (format === DOCUMENT_FORMATS.word) return { contents: await renderDocx(info, content), mimeType: DOCUMENT_MIME_TYPES.docx, extension: format };
        if (format === DOCUMENT_FORMATS.pdf) return { contents: await renderPdf(info, content), mimeType: DOCUMENT_MIME_TYPES.pdf, extension: format };
        throw new AppError(400, DOCUMENT_ERRORS.unknownFormat);
    }
}
