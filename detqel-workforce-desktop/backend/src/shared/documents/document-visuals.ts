import sharp from "sharp";
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js";
import { AppError } from "../errors/app-error.js";
import { DOCUMENT_ASSET_PATTERN, DOCUMENT_IMAGE_ERRORS, DOCUMENT_RENDER_LIMITS } from "../../constants/documentImageConstants.js";
import type { Block, DocumentVisual, InlineRun } from "./markdown-model.js";
import { normalizeDocumentImage } from "./document-image.service.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
// MathJax may load bundled font outline data, but never arbitrary modules or remote resources.
mathjax.asyncLoad = (name: string) => {
    if (!/^@mathjax\/mathjax-newcm-font\/js\/svg\/dynamic\/[a-z0-9-]+\.js$/i.test(name)) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidDocument);
    return import(name);
};

export type DocumentAssetResolver = (source: string) => Promise<Buffer>;

/** Formulas become actual glyph outlines; neither renderer displays raw LaTeX as a substitute. */
async function formula(source: string, display: boolean): Promise<DocumentVisual> {
    if (!source.trim() || source.length > DOCUMENT_RENDER_LIMITS.formulaCharacters) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidDocument);
    try {
        const input = new TeX({ packages: ["base", "ams", "textmacros"], maxBuffer: 8192, maxMacros: 500,
            formatError: () => { throw new Error("Invalid TeX"); } });
        const document = mathjax.document("", { InputJax: input, OutputJax: new SVG({ fontCache: "none" }),
            compileError: () => { throw new Error("Invalid formula"); }, typesetError: () => { throw new Error("Formula rendering failed"); } });
        const node = await document.convertPromise(source, { display, em: 10.5, ex: 5.25, containerWidth: 480 });
        const svgNode = adaptor.tags(node, "svg")[0];
        if (!svgNode) throw new Error("Missing formula drawing");
        const root = adaptor.outerHTML(svgNode);
        if (/data-mjx-error|<merror|<text\b|<image\b|<foreignObject\b|(?:href|src)="(?:https?:|file:)/i.test(root)) throw new Error("Unsupported formula content");
        const viewBox = String(adaptor.getAttribute(svgNode, "viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
        if (viewBox.length !== 4 || !viewBox.every(Number.isFinite)) throw new Error("Missing formula bounds");
        const [, minimumY, unitsWidth, unitsHeight] = viewBox;
        const width = unitsWidth * 10.5 / 1000;
        const height = unitsHeight * 10.5 / 1000;
        if (![width, height].every(value => Number.isFinite(value) && value > 0 && value < 10_000)) throw new Error("Formula size limit");
        adaptor.setAttribute(svgNode, "width", width + "pt");
        adaptor.setAttribute(svgNode, "height", height + "pt");
        const svg = adaptor.outerHTML(svgNode).replaceAll("currentColor", "#0f172a");
        const contents = await sharp(Buffer.from(svg), { density: 288, limitInputPixels: DOCUMENT_RENDER_LIMITS.imagePixels }).png().toBuffer();
        return { kind: "formula", contents, width, height, svg, ascent: -minimumY * 10.5 / 1000 };
    } catch { throw new AppError(422, "A document formula could not be typeset. Correct the LaTeX before exporting; its source was not substituted for the formula."); }
}

/** Resolve only this discussion's assets or explicitly embedded PNGs, with bounded decoding. */
export async function prepareDocumentVisuals(blocks: ReadonlyArray<Block>, resolve?: DocumentAssetResolver): Promise<Block[]> {
    const cache = new Map<string, Promise<DocumentVisual>>();
    let imageBytes = 0;
    let formulaCount = 0;
    let imageCount = 0;
    const image = (source: string): Promise<DocumentVisual> => {
        if (++imageCount > DOCUMENT_RENDER_LIMITS.figures) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge);
        const key = "image:" + source;
        const cached = cache.get(key);
        if (cached) return cached;
        const result = (async () => {
            let bytes: Buffer;
            if (DOCUMENT_ASSET_PATTERN.test(source) && resolve) bytes = await resolve(source);
            else if (/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(source) && source.length < DOCUMENT_RENDER_LIMITS.imageResponseBytes) bytes = Buffer.from(source.slice(source.indexOf(",") + 1), "base64");
            else throw new AppError(422, DOCUMENT_IMAGE_ERRORS.unavailableAsset);
            const contents = await normalizeDocumentImage(bytes);
            imageBytes += contents.length;
            if (imageBytes > DOCUMENT_RENDER_LIMITS.documentImageBytes) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge);
            const metadata = await sharp(contents).metadata();
            return { kind: "image" as const, contents, width: metadata.width!, height: metadata.height! };
        })();
        cache.set(key, result);
        return result;
    };
    const math = async (text: string, display: boolean) => {
        if (++formulaCount > DOCUMENT_RENDER_LIMITS.formulas) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge);
        const key = (display ? "display:" : "inline:") + text;
        if (!cache.has(key)) cache.set(key, formula(text, display).then(visual => {
            imageBytes += visual.contents.length;
            if (imageBytes > DOCUMENT_RENDER_LIMITS.documentImageBytes) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge);
            return visual;
        }));
        return cache.get(key)!;
    };
    const runs = async (items: ReadonlyArray<InlineRun>): Promise<InlineRun[]> => {
        const result: InlineRun[] = [];
        for (const run of items) {
            if (!run.code && !run.math && !run.image && /\$\$|\\[()[\]]|\\(?:frac|sqrt|sum|int|begin)\b/.test(run.text)) throw new AppError(422, "The document contains an unclosed or untyped formula. Correct its LaTeX delimiters before delivery.");
            result.push(run.math ? { ...run, visual: await math(run.text, false) }
                : run.image ? { ...run, visual: await image(run.image.source) } : run);
        }
        return result;
    };
    const visit = async (items: ReadonlyArray<Block>): Promise<Block[]> => {
        const result: Block[] = [];
        for (const block of items) {
            switch (block.type) {
                case "paragraph": case "heading": result.push({ ...block, runs: await runs(block.runs) }); break;
                case "image": result.push({ ...block, visual: await image(block.source) }); break;
                case "math": result.push({ ...block, visual: await math(block.text, true) }); break;
                case "quote": result.push({ ...block, blocks: await visit(block.blocks) }); break;
                case "list": {
                    const entries = [];
                    for (const entry of block.items) entries.push({ ...entry, runs: await runs(entry.runs), children: await visit(entry.children) });
                    result.push({ ...block, items: entries }); break;
                }
                case "table": {
                    if (block.header.length > DOCUMENT_RENDER_LIMITS.tableColumns || block.rows.length > DOCUMENT_RENDER_LIMITS.tableRows) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge);
                    const header = [];
                    const rows = [];
                    for (const cell of block.header) header.push(await runs(cell));
                    for (const row of block.rows) { const cells = []; for (const cell of row) cells.push(await runs(cell)); rows.push(cells); }
                    result.push({ ...block, header, rows }); break;
                }
                case "code":
                    if (/^(?:mermaid|plantuml|graphviz|dot|image)$/i.test(block.language ?? "")) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidDocument);
                    result.push(block); break;
                default: result.push(block);
            }
        }
        return result;
    };
    return visit(blocks);
}
