import { inflateRawSync } from "node:zlib";
import { AppError } from "../errors/app-error.js";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_ENTRY = 0x02014b50;
const LOCAL_ENTRY = 0x04034b50;
const BODY_PART = "word/document.xml";
/** Largest body XML accepted after decompression, so a crafted file cannot expand without bound. */
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const UNREADABLE = "This Word document could not be read. Save it again as .docx, or as text, and retry.";

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };

function bodyXml(archive: Buffer): string {
    let end = -1;
    for (let at = archive.length - 22; at >= Math.max(0, archive.length - 22 - 0xffff); at--) {
        if (archive.readUInt32LE(at) === END_OF_CENTRAL_DIRECTORY) { end = at; break; }
    }
    if (end < 0) throw new AppError(415, UNREADABLE);
    const count = archive.readUInt16LE(end + 10);
    let at = archive.readUInt32LE(end + 16);
    for (let index = 0; index < count; index++) {
        if (at + 46 > archive.length || archive.readUInt32LE(at) !== CENTRAL_ENTRY) break;
        const method = archive.readUInt16LE(at + 10);
        const compressedSize = archive.readUInt32LE(at + 20);
        const nameLength = archive.readUInt16LE(at + 28);
        const extraLength = archive.readUInt16LE(at + 30);
        const commentLength = archive.readUInt16LE(at + 32);
        const localOffset = archive.readUInt32LE(at + 42);
        const name = archive.toString("utf8", at + 46, at + 46 + nameLength);
        at += 46 + nameLength + extraLength + commentLength;
        if (name !== BODY_PART) continue;
        if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== LOCAL_ENTRY) break;
        const start = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
        const data = archive.subarray(start, start + compressedSize);
        if (method === 0) return data.toString("utf8");
        if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_BODY_BYTES }).toString("utf8");
        break;
    }
    throw new AppError(415, UNREADABLE);
}

function decode(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
        if (entity[0] !== "#") return XML_ENTITIES[entity.toLowerCase()] ?? match;
        const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
}

/** The readable text of a .docx: paragraphs on their own lines, headings marked with #, table cells separated by tabs. */
export function docxText(archive: Buffer): string {
    let xml: string;
    try {
        xml = bodyXml(archive);
    } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(415, UNREADABLE);
    }
    const lines: string[] = [];
    for (const paragraph of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
        const heading = /<w:pStyle w:val="(?:Heading|Title)(\d?)"/i.exec(paragraph);
        const text = decode(paragraph
            .replace(/<w:tab\/>/g, "\t")
            .replace(/<w:br\/>/g, "\n")
            .replace(/<\/w:tc>/g, "\t")
            .replace(/<[^>]*>/g, "")).replace(/\t+$/, "");
        if (!text.trim()) { lines.push(""); continue; }
        lines.push(heading ? `${"#".repeat(Number(heading[1]) || 1)} ${text.trim()}` : text);
    }
    const result = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!result) throw new AppError(400, "The document contains no text to index.");
    return result;
}
