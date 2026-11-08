import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown, plainText } from "../../src/shared/documents/markdown-model.js";
import { DocumentExporter } from "../../src/shared/documents/document-exporter.js";
import { resolvePdfFonts } from "../../src/shared/documents/pdf-renderer.js";
import { fileStem, numberedNames } from "../../src/shared/documents/file-names.js";

const info = { title: "AI Demand Brief", subtitle: "NABSPY · Lead · DETQEL CORE", author: "NABSPY", exportedAt: "2026-11-08 10:00 UTC" };

const SAMPLE = `# AI Demand Brief

Demand is **strongest** in *regulated* sectors, see [the report](https://example.test/report) and [this](javascript:alert(1)).

| Industry | Budget |
|---|---|
| Healthcare | $40,000 |
| Finance | $80,000 |

1. First
   - nested **point**
2. Second

- [x] Done
- [ ] Open

Growth follows $N(t) = N_0 e^{rt}$ while costs range from $5 to $10.

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

\`\`\`python
print("$5")
\`\`\`

> Confirm the total with finance.

<script>alert(1)</script>

---
`;

describe("Markdown model", () => {
    const blocks = parseMarkdown(SAMPLE);

    test("reads headings, paragraphs, tables, lists, code, quotes, rules, and math into blocks", () => {
        assert.deepEqual(blocks.map(block => block.type), ["heading", "paragraph", "table", "list", "list", "paragraph", "math", "code", "quote", "paragraph", "rule"]);
    });

    test("keeps inline formatting and only web or mail links", () => {
        const paragraph = blocks[1] as Extract<(typeof blocks)[number], { type: "paragraph" }>;
        assert.ok(paragraph.runs.some(run => run.text === "strongest" && run.bold));
        assert.ok(paragraph.runs.some(run => run.text === "regulated" && run.italic));
        assert.ok(paragraph.runs.some(run => run.text === "the report" && run.link === "https://example.test/report"));
        assert.ok(paragraph.runs.some(run => run.text === "this" && run.link === undefined), "a script link is kept as plain text");
    });

    test("separates formulas from money", () => {
        const paragraph = blocks[5] as Extract<(typeof blocks)[number], { type: "paragraph" }>;
        assert.deepEqual(paragraph.runs.filter(run => run.math).map(run => run.text), ["N(t) = N_0 e^{rt}"]);
        assert.match(plainText(paragraph.runs), /from \$5 to \$10\./);
        const display = blocks[6] as Extract<(typeof blocks)[number], { type: "math" }>;
        assert.match(display.text, /\\sum_\{i=1\}/);
    });

    test("keeps code exactly, nests lists, marks tasks, and never interprets raw HTML", () => {
        assert.deepEqual(blocks[7], { type: "code", text: "print(\"$5\")", language: "python" });
        const ordered = blocks[3] as Extract<(typeof blocks)[number], { type: "list" }>;
        assert.equal(ordered.ordered, true);
        assert.equal(ordered.items[0].children[0].type, "list");
        const tasks = blocks[4] as Extract<(typeof blocks)[number], { type: "list" }>;
        assert.deepEqual(tasks.items.map(item => item.checked), [true, false]);
        const html = blocks[9] as Extract<(typeof blocks)[number], { type: "paragraph" }>;
        assert.equal(plainText(html.runs), "<script>alert(1)</script>");
    });
});

describe("DocumentExporter", () => {
    const exporter = new DocumentExporter();

    test("Markdown keeps the reply as written under a header that cannot break out of its comment", async () => {
        const file = await exporter.export("md", { ...info, subtitle: "A -- B" }, SAMPLE);
        const text = file.contents.toString("utf8");
        assert.ok(text.startsWith("<!-- Exported from DETQEL Kin · A — B · 2026-11-08 10:00 UTC -->"));
        assert.ok(text.includes("| Healthcare | $40,000 |"));
        assert.equal(file.mimeType, "text/markdown; charset=utf-8");
    });

    test("Word output is a .docx package with its document part", async () => {
        const file = await exporter.export("docx", info, SAMPLE);
        assert.equal(file.contents.subarray(0, 2).toString("latin1"), "PK");
        assert.ok(file.contents.includes(Buffer.from("word/document.xml")));
        assert.equal(file.extension, "docx");
    });

    const fonts = (() => { try { return resolvePdfFonts(); } catch { return null; } })();
    test("PDF output is a complete PDF document", { skip: fonts ? false : "no system PDF fonts on this machine" }, async () => {
        const file = await exporter.export("pdf", info, SAMPLE.repeat(4));
        const text = file.contents.toString("latin1");
        assert.ok(text.startsWith("%PDF-"));
        assert.ok(text.trimEnd().endsWith("%%EOF"));
        assert.ok((text.match(/\/Type \/Page\b/g) ?? []).length >= 2, "long content flows onto more pages");
    });

    test("an empty reply cannot be exported", async () => {
        await assert.rejects(() => exporter.export("md", info, "  \n "), /nothing in this reply/);
    });

    test("PDF export fails clearly when the system fonts it needs are missing", () => {
        assert.throws(() => resolvePdfFonts("win32", {}), /No system font was found/);
    });
});

describe("file names", () => {
    test("titles become portable names that cannot be hidden or escape a folder", () => {
        assert.equal(fileStem("Q3: Plan / \"Final\"?"), "Q3 Plan Final");
        assert.equal(fileStem("..\\..\\secrets"), "secrets");
        assert.equal(fileStem("***", "Aiden"), "Aiden", "a title with nothing usable falls to the next name");
        assert.equal(fileStem("!!!"), null);
        assert.equal(fileStem("x".repeat(200))!.length, 80);
    });

    test("repeated names are numbered", () => {
        const names = [...numberedNames("Plan", "md")];
        assert.deepEqual(names.slice(0, 3), ["Plan.md", "Plan (2).md", "Plan (3).md"]);
        assert.equal(names.length, 100);
    });
});
