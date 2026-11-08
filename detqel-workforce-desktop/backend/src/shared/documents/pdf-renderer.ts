import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
import { AppError } from "../errors/app-error.js";
import { DOCUMENT_ATTRIBUTION, DOCUMENT_ERRORS, PDF_LAYOUT, pdfFontCandidates } from "../../constants/documentConstants.js";
import { plainText, type Block, type InlineRun, type ListEntry } from "./markdown-model.js";
import type { DocumentInfo } from "./document-exporter.js";

type FontRole = "regular" | "bold" | "italic" | "mono";

/** The first font file that exists for each style on this computer. */
export function resolvePdfFonts(platform: NodeJS.Platform = process.platform, environment: NodeJS.ProcessEnv = process.env): Record<FontRole, string> {
    const candidates = pdfFontCandidates(platform, environment);
    const roles: FontRole[] = ["regular", "bold", "italic", "mono"];
    const fonts = Object.fromEntries(roles.map(role => [role, candidates[role].find(path => existsSync(path))]));
    if (roles.some(role => !fonts[role])) throw new AppError(409, DOCUMENT_ERRORS.noPdfFont);
    return fonts as Record<FontRole, string>;
}

const fontFor = (run: InlineRun): FontRole => (run.code ? "mono" : run.bold ? "bold" : run.italic || run.math ? "italic" : "regular");

class PdfLayout {
    private readonly left: number;
    private readonly width: number;

    constructor(private readonly doc: PDFKit.PDFDocument) {
        this.left = doc.page.margins.left;
        this.width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    }

    private get bottom() {
        return this.doc.page.height - this.doc.page.margins.bottom;
    }

    /** Starts a new page when the next element of this height would not fit, unless it is taller than a page. */
    private keepTogether(height: number) {
        const pageContent = this.bottom - this.doc.page.margins.top;
        if (height < pageContent && this.doc.y + height > this.bottom) this.doc.addPage();
    }

    runs(items: ReadonlyArray<InlineRun>, x: number, width: number, size: number, color: string = PDF_LAYOUT.colors.text) {
        const visible = items.filter(run => run.text.length > 0);
        if (visible.length === 0) return;
        visible.forEach((run, index) => {
            const options: PDFKit.Mixins.TextOptions = {
                continued: index < visible.length - 1,
                lineGap: PDF_LAYOUT.lineGap,
                link: run.link ?? null,
                underline: Boolean(run.link),
                strike: Boolean(run.strike),
            };
            this.doc.font(fontFor(run)).fontSize(run.code ? PDF_LAYOUT.fontSize.code : size)
                .fillColor(run.link ? PDF_LAYOUT.colors.link : run.math ? PDF_LAYOUT.colors.link : color);
            if (index === 0) this.doc.text(run.text, x, this.doc.y, { ...options, width });
            else this.doc.text(run.text, options);
        });
    }

    blocks(items: ReadonlyArray<Block>, x = this.left, width = this.width) {
        for (const block of items) this.block(block, x, width);
    }

    private gap(size: number = PDF_LAYOUT.paragraphGap) {
        this.doc.y += size;
    }

    private block(block: Block, x: number, width: number) {
        const { doc } = this;
        switch (block.type) {
            case "heading": {
                const size = PDF_LAYOUT.fontSize.heading[block.level - 1];
                this.keepTogether(size * 3);
                this.gap(block.level <= 2 ? 8 : 4);
                this.runs(block.runs.map(run => ({ ...run, bold: true })), x, width, size);
                this.gap(4);
                break;
            }
            case "paragraph":
                this.runs(block.runs, x, width, PDF_LAYOUT.fontSize.body);
                this.gap();
                break;
            case "math":
                doc.font("italic").fontSize(PDF_LAYOUT.fontSize.body + 1).fillColor(PDF_LAYOUT.colors.link)
                    .text(block.text, x, doc.y, { width, align: "center", lineGap: PDF_LAYOUT.lineGap });
                this.gap();
                break;
            case "code": {
                const pad = PDF_LAYOUT.codePadding;
                doc.font("mono").fontSize(PDF_LAYOUT.fontSize.code);
                const height = doc.heightOfString(block.text, { width: width - pad * 2, lineGap: PDF_LAYOUT.lineGap }) + pad * 2;
                this.keepTogether(height);
                const top = doc.y;
                // A block taller than a page flows across pages without its background.
                if (top + height <= this.bottom) doc.rect(x, top, width, height).fill(PDF_LAYOUT.colors.codeBackground);
                doc.fillColor(PDF_LAYOUT.colors.text).font("mono").fontSize(PDF_LAYOUT.fontSize.code)
                    .text(block.text, x + pad, top + pad, { width: width - pad * 2, lineGap: PDF_LAYOUT.lineGap });
                doc.y = Math.max(doc.y, top + height);
                this.gap();
                break;
            }
            case "quote": {
                const startPage = doc.bufferedPageRange().count;
                const top = doc.y;
                this.blocks(block.blocks, x + PDF_LAYOUT.quoteIndent, width - PDF_LAYOUT.quoteIndent);
                const barTop = doc.bufferedPageRange().count === startPage ? top : doc.page.margins.top;
                doc.moveTo(x + 3, barTop).lineTo(x + 3, doc.y - PDF_LAYOUT.paragraphGap)
                    .lineWidth(2).strokeColor(PDF_LAYOUT.colors.quoteBar).stroke();
                break;
            }
            case "rule":
                this.gap(4);
                doc.moveTo(x, doc.y).lineTo(x + width, doc.y).lineWidth(0.75).strokeColor(PDF_LAYOUT.colors.rule).stroke();
                this.gap(10);
                break;
            case "list":
                this.list(block.items, block.ordered, block.start, x, width);
                this.gap(3);
                break;
            case "table":
                this.table(block.header, block.rows, x, width);
                this.gap();
                break;
        }
    }

    private list(items: ReadonlyArray<ListEntry>, ordered: boolean, start: number, x: number, width: number) {
        const { doc } = this;
        const indent = PDF_LAYOUT.listIndent;
        items.forEach((item, index) => {
            const marker = item.checked !== undefined ? (item.checked ? "☑" : "☐") : ordered ? `${start + index}.` : "•";
            this.keepTogether(PDF_LAYOUT.fontSize.body * 2);
            const top = doc.y;
            doc.font("regular").fontSize(PDF_LAYOUT.fontSize.body).fillColor(PDF_LAYOUT.colors.muted)
                .text(marker, x, top, { width: indent + 4, lineBreak: false });
            doc.y = top;
            this.runs(item.runs, x + indent + 4, width - indent - 4, PDF_LAYOUT.fontSize.body);
            if (item.runs.length === 0) doc.y = top + PDF_LAYOUT.fontSize.body + PDF_LAYOUT.lineGap;
            doc.y += 2;
            for (const child of item.children) {
                if (child.type === "list") this.list(child.items, child.ordered, child.start, x + indent + 4, width - indent - 4);
                else this.block(child, x + indent + 4, width - indent - 4);
            }
        });
    }

    private table(header: ReadonlyArray<ReadonlyArray<InlineRun>>, rows: ReadonlyArray<ReadonlyArray<ReadonlyArray<InlineRun>>>, x: number, width: number) {
        const { doc } = this;
        const columns = Math.max(header.length, ...rows.map(row => row.length));
        if (columns === 0) return;
        const columnWidth = width / columns;
        const pad = PDF_LAYOUT.cellPadding;
        const drawRow = (cells: ReadonlyArray<ReadonlyArray<InlineRun>>, isHeader: boolean) => {
            const measure = (cell: ReadonlyArray<InlineRun>) => {
                doc.font(isHeader ? "bold" : "regular").fontSize(PDF_LAYOUT.fontSize.small);
                return doc.heightOfString(plainText(cell) || " ", { width: columnWidth - pad * 2, lineGap: PDF_LAYOUT.lineGap });
            };
            const height = Math.max(...Array.from({ length: columns }, (_unused, index) => measure(cells[index] ?? []))) + pad * 2;
            if (doc.y + height > this.bottom) doc.addPage();
            const top = doc.y;
            if (isHeader) doc.rect(x, top, width, height).fill(PDF_LAYOUT.colors.tableHeader);
            for (let index = 0; index < columns; index++) {
                const left = x + index * columnWidth;
                doc.rect(left, top, columnWidth, height).lineWidth(0.5).strokeColor(PDF_LAYOUT.colors.rule).stroke();
                doc.y = top + pad;
                const cell = cells[index] ?? [];
                this.runs(isHeader ? cell.map(run => ({ ...run, bold: true })) : cell, left + pad, columnWidth - pad * 2, PDF_LAYOUT.fontSize.small);
            }
            doc.y = top + height;
        };
        drawRow(header, true);
        for (const row of rows) drawRow(row, false);
    }
}

/** Renders a document as a PDF file. */
export async function renderPdf(info: DocumentInfo, content: ReadonlyArray<Block>, fonts: Record<FontRole, string> = resolvePdfFonts()): Promise<Buffer> {
    const doc = new PDFDocument({
        size: PDF_LAYOUT.pageSize,
        margin: PDF_LAYOUT.margin,
        bufferPages: true,
        info: { Title: info.title, Author: info.author, Subject: info.subtitle, Creator: DOCUMENT_ATTRIBUTION },
    });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on("data", chunk => chunks.push(chunk as Buffer));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });
    for (const [role, path] of Object.entries(fonts)) doc.registerFont(role, path);

    const layout = new PdfLayout(doc);
    layout.runs([{ text: info.title, bold: true }], doc.page.margins.left, doc.page.width - doc.page.margins.left * 2, PDF_LAYOUT.fontSize.heading[0] + 2);
    doc.y += 2;
    layout.runs([{ text: info.subtitle }], doc.page.margins.left, doc.page.width - doc.page.margins.left * 2, PDF_LAYOUT.fontSize.small, PDF_LAYOUT.colors.muted);
    doc.y += 14;
    layout.blocks(content);

    // Footer on every page, written once the page count is known. The bottom margin is lifted while writing
    // so the footer line itself never starts a new page.
    const pages = doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index++) {
        doc.switchToPage(pages.start + index);
        const margin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc.font("regular").fontSize(PDF_LAYOUT.fontSize.small).fillColor(PDF_LAYOUT.colors.muted)
            .text(`${DOCUMENT_ATTRIBUTION} · ${info.exportedAt} · ${index + 1} / ${pages.count}`, doc.page.margins.left, doc.page.height - margin / 2 - 4, {
                width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                align: "center",
                lineBreak: false,
            });
        doc.page.margins.bottom = margin;
    }
    doc.end();
    return done;
}
