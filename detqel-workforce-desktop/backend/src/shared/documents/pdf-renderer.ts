import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { openSync, type Font } from "fontkit";
import { AppError } from "../errors/app-error.js";
import { DOCUMENT_ATTRIBUTION, DOCUMENT_ERRORS, PDF_LAYOUT, pdfFontCandidates } from "../../constants/documentConstants.js";
import { DOCUMENT_IMAGE_ERRORS, DOCUMENT_RENDER_LIMITS } from "../../constants/documentImageConstants.js";
import type { Block, DocumentVisual, InlineRun, ListEntry } from "./markdown-model.js";
import type { DocumentInfo } from "./document-exporter.js";

type FontRole = "regular" | "bold" | "italic" | "mono";
type Piece = { run: InlineRun; width: number; ascent: number; descent: number; size: number; text?: string; visual?: DocumentVisual };
type Line = { pieces: Piece[]; width: number; ascent: number; descent: number; height: number };
const fontFor = (run: InlineRun): FontRole => run.code ? "mono" : run.bold ? "bold" : run.italic ? "italic" : "regular";
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function resolvePdfFonts(platform: NodeJS.Platform = process.platform, environment: NodeJS.ProcessEnv = process.env): Record<FontRole, string> {
    const candidates = pdfFontCandidates(platform, environment);
    const roles: FontRole[] = ["regular", "bold", "italic", "mono"];
    const fonts = Object.fromEntries(roles.map(role => [role, candidates[role].find(path => existsSync(path))]));
    if (roles.some(role => !fonts[role])) throw new AppError(409, DOCUMENT_ERRORS.noPdfFont);
    return fonts as Record<FontRole, string>;
}

/** Measure full lines before drawing. No content relies on PDFKit's continued-text cursor state. */
class PdfLayout {
    readonly left: number;
    readonly width: number;
    private readonly coverage = new Set<string>();

    constructor(private readonly doc: PDFKit.PDFDocument, private readonly fonts: Record<FontRole, Font>) {
        this.left = doc.page.margins.left;
        this.width = doc.page.width - this.left - doc.page.margins.right;
    }
    private get bottom() { return this.doc.page.height - this.doc.page.margins.bottom; }
    private get capacity() { return this.bottom - this.doc.page.margins.top; }
    private newPage() {
        if (this.doc.bufferedPageRange().count >= DOCUMENT_RENDER_LIMITS.pages) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge);
        this.doc.addPage();
    }
    private ensure(height: number) {
        if (height > this.capacity) throw new AppError(422, "An element is too large for the document page. Split the content before exporting.");
        if (this.doc.y + height > this.bottom) this.newPage();
    }
    private textPiece(run: InlineRun, text: string, size: number): Piece {
        const role = fontFor(run);
        const font = this.fonts[role];
        for (const character of text) {
            if (/\s|\p{Cf}/u.test(character)) continue;
            const key = role + character;
            if (this.coverage.has(key)) continue;
            const point = character.codePointAt(0)!;
            if (!font.hasGlyphForCodePoint(point)) throw new AppError(422, "The PDF font cannot render character U+" + point.toString(16).toUpperCase() + ". The document was not exported with missing text.");
            this.coverage.add(key);
        }
        this.doc.font(role).fontSize(size);
        return { run, text, size, width: this.doc.widthOfString(text), ascent: font.ascent / font.unitsPerEm * size, descent: -font.descent / font.unitsPerEm * size };
    }
    private visualPiece(run: InlineRun, visual: DocumentVisual, width: number, size: number): Piece {
        const naturalWidth = visual.kind === "formula" ? visual.width * size / PDF_LAYOUT.fontSize.body : visual.width * 0.75;
        const naturalHeight = visual.kind === "formula" ? visual.height * size / PDF_LAYOUT.fontSize.body : visual.height * 0.75;
        const scale = Math.min(1, width / naturalWidth, (visual.kind === "formula" ? 300 : 100) / naturalHeight);
        if (visual.kind === "formula" && scale < 0.55) throw new AppError(422, "A formula is too wide for its column. Use aligned formula lines.");
        const height = naturalHeight * scale;
        const ascent = visual.kind === "formula" ? (visual.ascent ?? visual.height) * size / PDF_LAYOUT.fontSize.body * scale : height;
        return { run, visual, width: naturalWidth * scale, ascent, descent: Math.max(0, height - ascent), size };
    }
    private lines(items: ReadonlyArray<InlineRun>, width: number, size: number, preserveWhitespace = false): Line[] {
        if (width < 20) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge);
        const result: Line[] = [];
        let line: Piece[] = [];
        let used = 0;
        const finish = () => {
            if (!preserveWhitespace) while (line.length && line[line.length - 1].text?.match(/^\s+$/)) used -= line.pop()!.width;
            const ascent = Math.max(size * 0.8, ...line.map(piece => piece.ascent));
            const descent = Math.max(size * 0.2, ...line.map(piece => piece.descent));
            result.push({ pieces: line, width: used, ascent, descent, height: ascent + descent + PDF_LAYOUT.lineGap });
            line = []; used = 0;
        };
        const append = (piece: Piece) => {
            const space = piece.text !== undefined && /^\s+$/.test(piece.text);
            if (used + piece.width > width + 0.01 && line.length) finish();
            if (!line.length && space && !preserveWhitespace) return;
            line.push(piece); used += piece.width;
        };
        for (const run of items) {
            if (run.math || run.image) {
                if (!run.visual) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidDocument);
                append(this.visualPiece(run, run.visual, width, size));
                continue;
            }
            const actualSize = run.code ? Math.min(size, PDF_LAYOUT.fontSize.code) : size;
            const parts = run.text.replaceAll("\r\n", "\n").replaceAll("\t", "    ").match(/\n|[^\S\n]+|\S+/gu) ?? [];
            for (const part of parts) {
                if (part === "\n") { finish(); continue; }
                const piece = this.textPiece(run, part, actualSize);
                if (piece.width <= width) { append(piece); continue; }
                // Oversized URLs and code identifiers wrap at grapheme boundaries without truncation.
                let chunk = "";
                for (const { segment } of graphemes.segment(part)) {
                    const candidate = this.textPiece(run, chunk + segment, actualSize);
                    if (candidate.width > width && chunk) { append(this.textPiece(run, chunk, actualSize)); finish(); chunk = segment; }
                    else chunk += segment;
                }
                if (chunk) append(this.textPiece(run, chunk, actualSize));
            }
        }
        if (line.length || result.length === 0) finish();
        return result;
    }
    private visual(visual: DocumentVisual, x: number, y: number, width: number, height: number) {
        if (visual.svg) {
            // @types/svg-to-pdfkit declares the constructor where the library accepts a PDFDocument instance.
            SVGtoPDF(this.doc as unknown as Parameters<typeof SVGtoPDF>[0], visual.svg, x, y, {
                width, height, preserveAspectRatio: "xMidYMid meet",
                fontCallback: () => { throw new AppError(422, "A formula contains text without embedded glyph outlines."); },
                imageCallback: () => { throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidDocument); },
                documentCallback: () => { throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidDocument); },
                warningCallback: () => { throw new AppError(422, "A formula could not be rendered faithfully."); },
            });
        } else this.doc.image(visual.contents, x, y, { width, height });
    }
    private drawLine(line: Line, x: number, top: number, color: string = PDF_LAYOUT.colors.text) {
        let cursor = x;
        const baseline = top + line.ascent;
        for (const piece of line.pieces) {
            if (piece.visual) this.visual(piece.visual, cursor, baseline - piece.ascent, piece.width, piece.ascent + piece.descent);
            else {
                this.doc.font(fontFor(piece.run)).fontSize(piece.size).fillColor(piece.run.link ? PDF_LAYOUT.colors.link : color)
                    .text(piece.text!, cursor, baseline - piece.ascent, { lineBreak: false, link: piece.run.link, underline: Boolean(piece.run.link), strike: Boolean(piece.run.strike), oblique: piece.run.bold && piece.run.italic ? 12 : false });
            }
            cursor += piece.width;
        }
    }
    runs(items: ReadonlyArray<InlineRun>, x: number, width: number, size: number, color: string = PDF_LAYOUT.colors.text, quote = false) {
        for (const line of this.lines(items, width, size)) {
            this.ensure(line.height);
            const top = this.doc.y;
            this.drawLine(line, x, top, color);
            if (quote) this.doc.moveTo(x - 10, top).lineTo(x - 10, top + line.height).lineWidth(2).strokeColor(PDF_LAYOUT.colors.quoteBar).stroke();
            this.doc.y = top + line.height;
        }
    }
    blocks(items: ReadonlyArray<Block>, x = this.left, width = this.width, quote = false) {
        for (let index = 0; index < items.length; index++) {
            const block = items[index];
            switch (block.type) {
                case "heading": {
                    const size = PDF_LAYOUT.fontSize.heading[block.level - 1];
                    const runs = block.runs.map(run => ({ ...run, bold: true }));
                    const height = this.lines(runs, width, size).reduce((sum, line) => sum + line.height, 0);
                    const next = items[index + 1];
                    let following = next ? 36 : 0;
                    if (next?.type === "image" && next.visual) {
                        const scale = Math.min(width / (next.visual.width * 0.75), this.capacity * 0.68 / (next.visual.height * 0.75), 1);
                        following = next.visual.height * 0.75 * scale + this.lines([{ text: next.caption, italic: true }], width, PDF_LAYOUT.fontSize.small).reduce((sum, line) => sum + line.height, 0) + 24;
                    } else if (next?.type === "math" && next.visual) following = next.visual.height + 18;
                    this.ensure(height + following + 12);
                    this.doc.y += 8;
                    this.runs(runs, x, width, size, PDF_LAYOUT.colors.text, quote);
                    this.doc.y += 5;
                    break;
                }
                case "paragraph": this.runs(block.runs, x, width, PDF_LAYOUT.fontSize.body, PDF_LAYOUT.colors.text, quote); this.doc.y += PDF_LAYOUT.paragraphGap; break;
                case "math": {
                    if (!block.visual) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidDocument);
                    const piece = this.visualPiece({ text: block.text, math: true }, block.visual, width, PDF_LAYOUT.fontSize.body);
                    const height = piece.ascent + piece.descent;
                    this.ensure(height + 18);
                    this.visual(block.visual, x + (width - piece.width) / 2, this.doc.y + 6, piece.width, height);
                    this.doc.y += height + 18;
                    break;
                }
                case "image": {
                    if (!block.visual) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidDocument);
                    const caption = this.lines([{ text: block.caption, italic: true }], width, PDF_LAYOUT.fontSize.small);
                    const captionHeight = caption.reduce((sum, line) => sum + line.height, 0);
                    const scale = Math.min(width / (block.visual.width * 0.75), (this.capacity * 0.68) / (block.visual.height * 0.75), 1);
                    const height = block.visual.height * 0.75 * scale;
                    const figureWidth = block.visual.width * 0.75 * scale;
                    this.ensure(height + captionHeight + 24);
                    const top = this.doc.y + 8;
                    this.visual(block.visual, x + (width - figureWidth) / 2, top, figureWidth, height);
                    let y = top + height + 6;
                    for (const line of caption) { this.drawLine(line, x + (width - line.width) / 2, y, PDF_LAYOUT.colors.muted); y += line.height; }
                    this.doc.y = y + 10;
                    break;
                }
                case "code": {
                    const pad = PDF_LAYOUT.codePadding;
                    for (const line of this.lines([{ text: block.text, code: true }], width - 2 * pad, PDF_LAYOUT.fontSize.code, true)) {
                        this.ensure(line.height + 6);
                        const top = this.doc.y;
                        this.doc.rect(x, top, width, line.height + 6).fill(PDF_LAYOUT.colors.codeBackground);
                        this.drawLine(line, x + pad, top + 3);
                        this.doc.y = top + line.height + 6;
                    }
                    this.doc.y += PDF_LAYOUT.paragraphGap;
                    break;
                }
                case "quote": this.blocks(block.blocks, x + PDF_LAYOUT.quoteIndent, width - PDF_LAYOUT.quoteIndent, true); break;
                case "rule": this.ensure(14); this.doc.y += 4; this.doc.moveTo(x, this.doc.y).lineTo(x + width, this.doc.y).lineWidth(0.75).strokeColor(PDF_LAYOUT.colors.rule).stroke(); this.doc.y += 10; break;
                case "list": this.list(block.items, block.ordered, block.start, x, width, quote); this.doc.y += 3; break;
                case "table": this.table(block.header, block.rows, x, width); this.doc.y += PDF_LAYOUT.paragraphGap; break;
            }
        }
    }
    private list(items: ReadonlyArray<ListEntry>, ordered: boolean, start: number, x: number, width: number, quote: boolean) {
        const indent = PDF_LAYOUT.listIndent + 8;
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const lines = this.lines(item.runs, width - indent, PDF_LAYOUT.fontSize.body);
            this.ensure(lines[0].height);
            const top = this.doc.y;
            if (ordered || item.checked !== undefined) {
                const marker = item.checked === undefined ? String(start + index) + "." : item.checked ? "[x]" : "[ ]";
                this.drawLine(this.lines([{ text: marker }], indent - 3, PDF_LAYOUT.fontSize.body)[0], x, top, PDF_LAYOUT.colors.muted);
            } else this.doc.circle(x + 4, top + lines[0].ascent * 0.65, 1.5).fill(PDF_LAYOUT.colors.muted);
            this.doc.y = top;
            this.runs(item.runs, x + indent, width - indent, PDF_LAYOUT.fontSize.body, PDF_LAYOUT.colors.text, quote);
            this.doc.y += 3;
            this.blocks(item.children, x + indent, width - indent, quote);
        }
    }
    private table(header: ReadonlyArray<ReadonlyArray<InlineRun>>, rows: ReadonlyArray<ReadonlyArray<ReadonlyArray<InlineRun>>>, x: number, width: number) {
        const count = header.length;
        if (!count) return;
        const column = width / count;
        const pad = PDF_LAYOUT.cellPadding;
        const measure = (row: ReadonlyArray<ReadonlyArray<InlineRun>>, bold = false) => Array.from({ length: count }, (_, index) => this.lines((row[index] ?? []).map(run => bold ? { ...run, bold: true } : run), column - 2 * pad, PDF_LAYOUT.fontSize.small));
        const headerLines = measure(header, true);
        const heightOf = (lines: ReadonlyArray<ReadonlyArray<Line>>) => Math.max(...lines.map(cell => cell.reduce((sum, line) => sum + line.height, 0))) + 2 * pad;
        const headerHeight = heightOf(headerLines);
        if (headerHeight > this.capacity / 3) throw new AppError(422, "The table header is too large. Use shorter column headings.");
        const draw = (cells: ReadonlyArray<ReadonlyArray<Line>>, height: number, heading: boolean) => {
            const top = this.doc.y;
            if (heading) this.doc.rect(x, top, width, height).fill(PDF_LAYOUT.colors.tableHeader);
            cells.forEach((lines, index) => {
                const left = x + index * column;
                this.doc.rect(left, top, column, height).lineWidth(0.5).strokeColor(PDF_LAYOUT.colors.rule).stroke();
                let y = top + pad;
                for (const line of lines) { this.drawLine(line, left + pad, y); y += line.height; }
            });
            this.doc.y = top + height;
        };
        this.ensure(headerHeight + 26);
        draw(headerLines, headerHeight, true);
        const nextPage = () => { this.newPage(); draw(headerLines, headerHeight, true); };
        for (const row of rows) {
            const cells = measure(row);
            const total = heightOf(cells);
            if (total <= this.capacity - headerHeight && this.doc.y + total > this.bottom) nextPage();
            const offsets = cells.map(() => 0);
            while (offsets.some((offset, index) => offset < cells[index].length)) {
                const available = this.bottom - this.doc.y - 2 * pad;
                const remaining = cells.map((cell, index) => cell.slice(offsets[index]));
                const minimum = Math.max(...remaining.map(cell => cell[0]?.height ?? 0));
                if (minimum > this.capacity - headerHeight - 2 * pad) throw new AppError(422, "A table cell cannot fit on the page. Split its equation or content into shorter rows.");
                if (available < minimum) { nextPage(); continue; }
                const chunk = remaining.map((cell, index) => {
                    const taken: Line[] = [];
                    let height = 0;
                    for (const line of cell) { if (height + line.height > available) break; taken.push(line); height += line.height; }
                    offsets[index] += taken.length;
                    return taken;
                });
                draw(chunk, heightOf(chunk), false);
                if (offsets.some((offset, index) => offset < cells[index].length)) nextPage();
            }
        }
    }
}

export async function renderPdf(info: DocumentInfo, content: ReadonlyArray<Block>, paths: Record<FontRole, string> = resolvePdfFonts()): Promise<Buffer> {
    const doc = new PDFDocument({ size: PDF_LAYOUT.pageSize, margin: PDF_LAYOUT.margin, bufferPages: true,
        info: { Title: info.title, Author: info.author, Subject: info.subtitle, Creator: DOCUMENT_ATTRIBUTION } });
    const chunks: Buffer[] = [];
    let bytes = 0;
    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > DOCUMENT_RENDER_LIMITS.exportBytes) { doc.destroy(new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge)); return; }
            chunks.push(chunk);
        });
        doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
    });
    try {
        const fonts = {} as Record<FontRole, Font>;
        for (const role of Object.keys(paths) as FontRole[]) {
            doc.registerFont(role, paths[role]);
            fonts[role] = openSync(paths[role]) as Font;
        }
        const layout = new PdfLayout(doc, fonts);
        layout.runs([{ text: info.title, bold: true }], layout.left, layout.width, 22);
        doc.y += 5;
        layout.runs([{ text: info.subtitle }], layout.left, layout.width, PDF_LAYOUT.fontSize.small, PDF_LAYOUT.colors.muted);
        doc.y += 10;
        layout.blocks([{ type: "rule" }, ...content]);
        const pages = doc.bufferedPageRange();
        for (let index = 0; index < pages.count; index++) {
            doc.switchToPage(pages.start + index);
            const margin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            doc.font("regular").fontSize(7.5).fillColor(PDF_LAYOUT.colors.muted)
                .text(DOCUMENT_ATTRIBUTION + " · " + info.exportedAt + " · " + (index + 1) + " / " + pages.count,
                    layout.left, doc.page.height - margin / 2 - 4, { width: layout.width, align: "center", lineBreak: false });
            doc.page.margins.bottom = margin;
        }
        doc.end();
    } catch (error) { doc.destroy(error instanceof Error ? error : new Error("Document rendering failed")); }
    return done;
}
