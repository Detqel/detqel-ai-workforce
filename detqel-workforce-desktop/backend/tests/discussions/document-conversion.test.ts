import assert from "node:assert/strict";
import { test } from "node:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attachmentConversion, existingDocumentDelivery, requestedFont } from "../../src/shared/documents/delivery-intent.js";
import { renderPdf, resolveFontFamily } from "../../src/shared/documents/pdf-renderer.js";
import { parseMarkdown } from "../../src/shared/documents/markdown-model.js";

test("an attached document is converted as written, with the font the user named", () => {
    const request = "Directly convert the attached PRD_AI_Learner.md content into a PDF without modifying content. Apply the Raleway font style throughout the PDF document.";
    assert.deepEqual(attachmentConversion(request), { format: "pdf", font: "Raleway" });
    assert.deepEqual(attachmentConversion("Convert the attached document to Word"), { format: "docx" });
    assert.deepEqual(attachmentConversion("convert to PDF with Raleway font"), { format: "pdf", font: "Raleway" });
});

test("requests that change or style the content beyond a font go to the agents", () => {
    assert.equal(attachmentConversion("Summarize the attached document and make a PDF"), null);
    assert.equal(attachmentConversion("Read the attached document and summarize it."), null);
    assert.equal(attachmentConversion("Convert the attached document to PDF and make the font size bigger"), null);
    assert.equal(attachmentConversion("Convert it to PDF and Word"), null);
});

test("font names are read from common phrasings and generic words are ignored", () => {
    assert.equal(requestedFont("font: Open Sans"), "Open Sans");
    assert.equal(requestedFont("use the raleway font"), "raleway");
    assert.equal(requestedFont("use the same font"), undefined);
    assert.equal(requestedFont("Export the above answer as PDF"), undefined);
});

test("packaging a previous reply keeps working and carries the font", () => {
    assert.deepEqual(existingDocumentDelivery("Export the above answer as PDF"), { format: "pdf" });
    assert.deepEqual(existingDocumentDelivery("Convert this to pdf, font: Open Sans"), { format: "pdf", font: "Open Sans" });
    assert.equal(existingDocumentDelivery("Convert the attached PRD to PDF"), null);
});

test("an installed font family is found by file name and embedded in the PDF", { skip: process.platform !== "win32" || !process.env.SystemRoot }, async () => {
    const root = mkdtempSync(join(tmpdir(), "kin-fonts-"));
    try {
        const fonts = join(root, "Microsoft", "Windows", "Fonts", "raleway");
        mkdirSync(fonts, { recursive: true });
        copyFileSync(join(process.env.SystemRoot!, "Fonts", "segoeui.ttf"), join(fonts, "Raleway-Regular.ttf"));
        copyFileSync(join(process.env.SystemRoot!, "Fonts", "segoeuib.ttf"), join(fonts, "Raleway-Bold.ttf"));
        const environment = { SystemRoot: process.env.SystemRoot, LOCALAPPDATA: root };
        const paths = resolveFontFamily("Raleway", "win32", environment);
        assert.match(paths.regular, /Raleway-Regular\.ttf$/);
        assert.match(paths.bold, /Raleway-Bold\.ttf$/);
        assert.equal(paths.italic, paths.regular);
        const pdf = await renderPdf({ title: "PRD", subtitle: "Team", author: "Kin", exportedAt: "now" }, parseMarkdown("# Goals\n\nShip **fast**."), paths);
        assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
        assert.throws(() => resolveFontFamily("Definitely Missing Font", "win32", environment), /not installed on this computer/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});