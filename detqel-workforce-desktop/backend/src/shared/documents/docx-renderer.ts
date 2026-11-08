import {
    AlignmentType,
    BorderStyle,
    Document,
    ExternalHyperlink,
    Footer,
    HeadingLevel,
    LevelFormat,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
    type IParagraphOptions,
    type ParagraphChild,
} from "docx";
import { DOCUMENT_ATTRIBUTION, DOCX_FONTS, DOCX_LAYOUT } from "../../constants/documentConstants.js";
import type { Block, InlineRun, ListEntry } from "./markdown-model.js";
import type { DocumentInfo } from "./document-exporter.js";

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const NUMBERING = { bullets: "bullets", numbers: "numbers" } as const;
const INDENT_PER_LEVEL = 360;
const MAX_LIST_LEVELS = 6;

function runs(items: ReadonlyArray<InlineRun>): ParagraphChild[] {
    return items.flatMap((run): ParagraphChild[] => {
        // A line break inside a paragraph or list item.
        if (run.text === "\n") return [new TextRun({ break: 1 })];
        const text = new TextRun({
            text: run.text,
            bold: run.bold,
            italics: run.italic || run.math,
            strike: run.strike,
            font: run.code ? DOCX_FONTS.code : run.math ? DOCX_FONTS.math : undefined,
            size: run.code ? DOCX_LAYOUT.codeSizeHalfPoints : undefined,
            shading: run.code ? { type: ShadingType.CLEAR, color: "auto", fill: DOCX_LAYOUT.codeShading } : undefined,
            style: run.link ? "Hyperlink" : undefined,
        });
        return [run.link ? new ExternalHyperlink({ link: run.link, children: [text] }) : text];
    });
}

class WordLayout {
    private listInstance = 0;

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
                return [new Paragraph({ heading: HEADINGS[block.level - 1], children: runs(block.runs), ...this.quoted(quoteDepth) })];
            case "paragraph":
                return [new Paragraph({ children: runs(block.runs), spacing: { after: 120 }, ...this.quoted(quoteDepth) })];
            case "math":
                return [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 80, after: 160 },
                    children: [new TextRun({ text: block.text, italics: true, font: DOCX_FONTS.math })],
                })];
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
                return this.list(block.items, block.ordered, 0, quoteDepth);
            case "table":
                return [this.table(block.header, block.rows), new Paragraph({ spacing: { after: 120 } })];
        }
    }

    private list(items: ReadonlyArray<ListEntry>, ordered: boolean, level: number, quoteDepth: number): Array<Paragraph | Table> {
        // Every ordered list restarts its numbering.
        const instance = ++this.listInstance;
        const depth = Math.min(level, MAX_LIST_LEVELS - 1);
        return items.flatMap(item => [
            new Paragraph({
                numbering: { reference: ordered ? NUMBERING.numbers : NUMBERING.bullets, level: depth, instance: ordered ? instance : undefined },
                spacing: { after: 60 },
                children: [...(item.checked === undefined ? [] : [new TextRun({ text: item.checked ? "☑ " : "☐ " })]), ...runs(item.runs)],
                ...this.quoted(quoteDepth),
            }),
            ...item.children.flatMap(child => child.type === "list"
                ? this.list(child.items, child.ordered, level + 1, quoteDepth)
                : this.block(child, quoteDepth)),
        ]);
    }

    private table(header: ReadonlyArray<ReadonlyArray<InlineRun>>, rows: ReadonlyArray<ReadonlyArray<ReadonlyArray<InlineRun>>>): Table {
        const cell = (content: ReadonlyArray<InlineRun>, heading: boolean) => new TableCell({
            shading: heading ? { type: ShadingType.CLEAR, color: "auto", fill: DOCX_LAYOUT.headerShading } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: runs(heading ? content.map(run => ({ ...run, bold: true })) : content) })],
        });
        return new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({ tableHeader: true, children: header.map(content => cell(content, true)) }),
                ...rows.map(row => new TableRow({ children: row.map(content => cell(content, false)) })),
            ],
        });
    }
}

function levels(format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (level: number) => string) {
    return Array.from({ length: MAX_LIST_LEVELS }, (_unused, level) => ({
        level,
        format,
        text: text(level),
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: INDENT_PER_LEVEL * (level + 1), hanging: INDENT_PER_LEVEL / 1.5 } } },
    }));
}

/** Renders a document as a Word (.docx) file. */
export async function renderDocx(info: DocumentInfo, content: ReadonlyArray<Block>): Promise<Buffer> {
    const bullets = ["•", "◦", "▪"];
    const document = new Document({
        title: info.title,
        creator: info.author,
        description: info.subtitle,
        styles: { default: { document: { run: { font: DOCX_FONTS.body, size: DOCX_LAYOUT.bodySizeHalfPoints } } } },
        numbering: {
            config: [
                { reference: NUMBERING.bullets, levels: levels(LevelFormat.BULLET, level => bullets[level % bullets.length]) },
                { reference: NUMBERING.numbers, levels: levels(LevelFormat.DECIMAL, level => `%${level + 1}.`) },
            ],
        },
        sections: [{
            footers: {
                default: new Footer({
                    children: [new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: `${DOCUMENT_ATTRIBUTION} · ${info.exportedAt}`, size: DOCX_LAYOUT.smallSizeHalfPoints, color: DOCX_LAYOUT.mutedColor })],
                    })],
                }),
            },
            children: [
                new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: info.title })] }),
                new Paragraph({
                    spacing: { after: 240 },
                    children: [new TextRun({ text: info.subtitle, size: DOCX_LAYOUT.smallSizeHalfPoints, color: DOCX_LAYOUT.mutedColor })],
                }),
                ...new WordLayout().blocks(content),
            ],
        }],
    });
    return Packer.toBuffer(document);
}
