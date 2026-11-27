import {
    AlignmentType,
    BorderStyle,
    Document,
    ExternalHyperlink,
    Footer,
    HeadingLevel,
    ImageRun,
    LevelFormat,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    PageNumber,
    TableLayoutType,
    WidthType,
    type IParagraphOptions,
    type ParagraphChild,
    type INumberingOptions,
} from "docx";
import { DOCUMENT_ATTRIBUTION, DOCX_FONTS, DOCX_LAYOUT } from "../../constants/documentConstants.js";
import type { Block, InlineRun, ListEntry } from "./markdown-model.js";
import type { DocumentInfo } from "./document-exporter.js";
import { AppError } from "../errors/app-error.js";
import { DOCUMENT_IMAGE_ERRORS, DOCUMENT_RENDER_LIMITS } from "../../constants/documentImageConstants.js";
import type { DocumentVisual } from "./markdown-model.js";

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const NUMBERING = { bullets: "bullets", numbers: "numbers" } as const;
const INDENT_PER_LEVEL = 360;
const MAX_LIST_LEVELS = 6;
const CONTENT_WIDTH = 644;

function picture(visual: DocumentVisual | undefined, description: string, maximumWidth = CONTENT_WIDTH, maximumHeight = 760): ImageRun {
    if (!visual) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidDocument);
    const units = visual.kind === "formula" ? 96 / 72 : 1;
    const scale = Math.min(1, maximumWidth / (visual.width * units), maximumHeight / (visual.height * units));
    if (visual.kind === "formula" && scale < 0.55) throw new AppError(422, "A formula is too wide for the document. Split it into aligned lines before delivery.");
    return new ImageRun({ type: "png", data: visual.contents,
        transformation: { width: visual.width * units * scale, height: visual.height * units * scale },
        altText: { title: visual.kind === "formula" ? "Equation" : "Figure", name: description.slice(0, 120), description } });
}

function runs(items: ReadonlyArray<InlineRun>, maximumWidth = CONTENT_WIDTH, size?: number): ParagraphChild[] {
    return items.flatMap((run): ParagraphChild[] => {
        if (run.math || run.image) return [picture(run.visual, run.text, maximumWidth)];
        // A line break inside a paragraph or list item.
        if (run.text === "\n") return [new TextRun({ break: 1 })];
        const text = new TextRun({
            text: run.text,
            bold: run.bold,
            italics: run.italic || run.math,
            strike: run.strike,
            font: run.code ? DOCX_FONTS.code : run.math ? DOCX_FONTS.math : undefined,
            size: run.code ? DOCX_LAYOUT.codeSizeHalfPoints : size,
            shading: run.code ? { type: ShadingType.CLEAR, color: "auto", fill: DOCX_LAYOUT.codeShading } : undefined,
            style: run.link ? "Hyperlink" : undefined,
        });
        return [run.link ? new ExternalHyperlink({ link: run.link, children: [text] }) : text];
    });
}

class WordLayout {
    private listInstance = 0;
    readonly numbering: INumberingOptions["config"][number][] = [];

    blocks(items: ReadonlyArray<Block>, quoteDepth = 0): Array<Paragraph | Table> {
        return items.flatMap(block => this.block(block, quoteDepth));
    }

    private quoted(depth: number): Partial<IParagraphOptions> {
        if (depth === 0) return {};
        return {
            indent: { left: INDENT_PER_LEVEL * depth },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: DOCX_LAYOUT.ruleColor, space: 8 } },
        };
    }

    private block(block: Block, quoteDepth: number): Array<Paragraph | Table> {
        switch (block.type) {
            case "heading":
                return [new Paragraph({ heading: HEADINGS[block.level - 1], keepNext: true, keepLines: true, spacing: { before: 240, after: 100 }, children: runs(block.runs), ...this.quoted(quoteDepth) })];
            case "paragraph":
                return [new Paragraph({ children: runs(block.runs), widowControl: true, spacing: { after: 140, line: 280 }, ...this.quoted(quoteDepth) })];
            case "math":
                return [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 80, after: 160 },
                    keepLines: true,
                    children: [picture(block.visual, block.text)],
                })];
            case "image":
                return [
                    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 180, after: 80 }, children: [picture(block.visual, block.caption)] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, keepLines: true, spacing: { after: 220 }, children: [new TextRun({ text: block.caption, size: DOCX_LAYOUT.smallSizeHalfPoints, color: DOCX_LAYOUT.mutedColor, italics: true })] }),
                ];
            case "code":
                return block.text.split("\n").map((line, index, lines) => new Paragraph({
                    shading: { type: ShadingType.CLEAR, color: "auto", fill: DOCX_LAYOUT.codeShading },
                    spacing: { before: index === 0 ? 80 : 0, after: index === lines.length - 1 ? 160 : 0 },
                    indent: { left: 120, right: 120 },
                    children: [new TextRun({ text: line || " ", font: DOCX_FONTS.code, size: DOCX_LAYOUT.codeSizeHalfPoints })],
                }));
            case "quote":
                return this.blocks(block.blocks, quoteDepth + 1);
            case "rule":
                return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: DOCX_LAYOUT.ruleColor, space: 1 } }, spacing: { after: 160 } })];
            case "list":
                return this.list(block.items, block.ordered, block.start, 0, quoteDepth);
            case "table":
                return [this.table(block.header, block.rows), new Paragraph({ spacing: { after: 120 } })];
        }
    }

    private list(items: ReadonlyArray<ListEntry>, ordered: boolean, start: number, level: number, quoteDepth: number): Array<Paragraph | Table> {
        // Every ordered list restarts its numbering.
        const instance = ++this.listInstance;
        const depth = Math.min(level, MAX_LIST_LEVELS - 1);
        const reference = ordered ? NUMBERING.numbers + "-" + instance : NUMBERING.bullets;
        if (ordered) this.numbering.push({ reference, levels: levels(LevelFormat.DECIMAL, value => `%${value + 1}.`, start, depth) });
        return items.flatMap(item => [
            new Paragraph({
                numbering: { reference, level: depth },
                spacing: { after: 60 },
                children: [...(item.checked === undefined ? [] : [new TextRun({ text: item.checked ? "☑ " : "☐ " })]), ...runs(item.runs)],
                ...this.quoted(quoteDepth),
            }),
            ...item.children.flatMap(child => child.type === "list"
                ? this.list(child.items, child.ordered, child.start, level + 1, quoteDepth)
                : this.block(child, quoteDepth)),
        ]);
    }

    private table(header: ReadonlyArray<ReadonlyArray<InlineRun>>, rows: ReadonlyArray<ReadonlyArray<ReadonlyArray<InlineRun>>>): Table {
        const columnWidth = Math.floor(9666 / header.length);
        const cell = (content: ReadonlyArray<InlineRun>, heading: boolean) => new TableCell({
            width: { size: columnWidth, type: WidthType.DXA },
            shading: heading ? { type: ShadingType.CLEAR, color: "auto", fill: DOCX_LAYOUT.headerShading } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ widowControl: true, children: runs(heading ? content.map(run => ({ ...run, bold: true })) : content, CONTENT_WIDTH / header.length - 14, DOCX_LAYOUT.smallSizeHalfPoints) })],
        });
        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: header.map(() => columnWidth),
            rows: [
                new TableRow({ tableHeader: true, cantSplit: true, children: header.map(content => cell(content, true)) }),
                ...rows.map(row => new TableRow({ children: row.map(content => cell(content, false)) })),
            ],
        });
    }
}

function levels(format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (level: number) => string, start = 1, startingLevel = 0) {
    return Array.from({ length: MAX_LIST_LEVELS }, (_unused, level) => ({
        level,
        format,
        start: level === startingLevel ? start : 1,
        text: text(level),
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: INDENT_PER_LEVEL * (level + 1), hanging: INDENT_PER_LEVEL / 1.5 } } },
    }));
}

/** Renders a document as a Word (.docx) file. */
/** fontFamily names the body font (for example "Raleway"); Word uses it where it is installed. */
export async function renderDocx(info: DocumentInfo, content: ReadonlyArray<Block>, fontFamily?: string): Promise<Buffer> {
    const bullets = ["•", "◦", "▪"];
    const layout = new WordLayout();
    const body = layout.blocks(content);
    const document = new Document({
        title: info.title,
        creator: info.author,
        description: info.subtitle,
        styles: { default: { document: { run: { font: fontFamily ?? DOCX_FONTS.body, size: DOCX_LAYOUT.bodySizeHalfPoints }, paragraph: { spacing: { line: 280, after: 140 } } } } },
        numbering: {
            config: [
                { reference: NUMBERING.bullets, levels: levels(LevelFormat.BULLET, level => bullets[level % bullets.length]) },
                ...layout.numbering,
            ],
        },
        sections: [{
            properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1120, bottom: 1120, left: 1120, right: 1120, header: 400, footer: 480 } } },
            footers: {
                default: new Footer({
                    children: [new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: `${DOCUMENT_ATTRIBUTION} · ${info.exportedAt} · `, size: DOCX_LAYOUT.smallSizeHalfPoints, color: DOCX_LAYOUT.mutedColor }), new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], size: DOCX_LAYOUT.smallSizeHalfPoints, color: DOCX_LAYOUT.mutedColor })],
                    })],
                }),
            },
            children: [
                new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: info.title })] }),
                new Paragraph({
                    spacing: { after: 240 },
                    children: [new TextRun({ text: info.subtitle, size: DOCX_LAYOUT.smallSizeHalfPoints, color: DOCX_LAYOUT.mutedColor })],
                }),
                ...body,
            ],
        }],
    });
    const contents = await Packer.toBuffer(document);
    if (contents.length > DOCUMENT_RENDER_LIMITS.exportBytes) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.contentTooLarge);
    return contents;
}
