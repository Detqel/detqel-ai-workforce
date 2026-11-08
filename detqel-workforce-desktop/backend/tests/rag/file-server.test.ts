import test, { afterEach, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileServer, type SessionLocation } from "../../src/shared/rag/file-server.js";
import { FILE_SERVER_SCOPES } from "../../src/constants/fileServerConstants.js";

let base: string;
let server: FileServer;
const LOCATION: SessionLocation = { workspaceId: "ws-1", scope: FILE_SERVER_SCOPES.conversations, sessionId: "sess-1" };

beforeEach(async () => { base = await mkdtemp(path.join(tmpdir(), "detqel-fileserver-")); server = new FileServer(base); });
afterEach(async () => { await rm(base, { recursive: true, force: true }); });

describe("FileServer", () => {
    test("ensureSession creates the chat and knowledge directories", async () => {
        const sessionDir = await server.ensureSession(LOCATION);
        assert.ok((await stat(path.join(sessionDir, "chat"))).isDirectory());
        assert.ok((await stat(path.join(sessionDir, "knowledge"))).isDirectory());
    });

    test("a text upload is stored and can be read and listed", async () => {
        const stored = await server.storeKnowledgeFile(LOCATION, "notes.txt", "text/plain", Buffer.from("hello world"));
        assert.equal(stored.size, 11);
        assert.equal((await server.readKnowledgeFile(LOCATION, "notes.txt")).toString("utf8"), "hello world");
        const listed = await server.listKnowledgeFiles(LOCATION);
        assert.equal(listed.length, 1);
        assert.equal(listed[0].name, "notes.txt");
    });

    test("artifacts are kept in their own folder, replaced by name, listed with their time, and removable", async () => {
        const sessionDir = await server.ensureSession(LOCATION);
        assert.ok((await stat(path.join(sessionDir, "artifacts"))).isDirectory());
        await server.storeArtifact(LOCATION, "Brief.md", "text/markdown", Buffer.from("v1"));
        await server.storeArtifact(LOCATION, "Brief.md", "text/markdown", Buffer.from("v2"));
        assert.equal((await server.readArtifact(LOCATION, "Brief.md")).toString("utf8"), "v2");
        const listed = await server.listArtifacts(LOCATION);
        assert.deepEqual(listed.map(file => file.name), ["Brief.md"]);
        assert.ok(listed[0].modifiedAt instanceof Date);
        assert.deepEqual(await server.listKnowledgeFiles(LOCATION), [], "artifacts never mix with knowledge");
        assert.equal(await server.hasArtifact(LOCATION, "Brief.md"), true);
        assert.equal(await server.deleteArtifact(LOCATION, "Brief.md"), true);
        assert.equal(await server.deleteArtifact(LOCATION, "Brief.md"), false);
        await assert.rejects(() => server.readArtifact(LOCATION, "Brief.md"), /not found/);
    });

    test("artifacts follow the same safety rules as uploads", async () => {
        await assert.rejects(() => server.storeArtifact(LOCATION, "tool.exe", "application/octet-stream", Buffer.from("x")), /not allowed/);
        await assert.rejects(() => server.storeArtifact(LOCATION, "../escape.md", "text/markdown", Buffer.from("x")), /not valid/);
        await assert.rejects(() => server.readArtifact(LOCATION, "..\\secrets.md"), /not valid/);
        await assert.rejects(() => server.deleteArtifact(LOCATION, ".hidden"), /not valid/);
    });

    test("executable and script uploads are rejected by extension", async () => {
        for (const name of ["payload.ps1", "run.sh", "setup.bat", "tool.exe"]) {
            await assert.rejects(() => server.storeKnowledgeFile(LOCATION, name, "text/plain", Buffer.from("x")), /not allowed/, name);
        }
    });

    test("an executable MIME type is rejected even with a benign extension", async () => {
        await assert.rejects(() => server.storeKnowledgeFile(LOCATION, "report.pdf", "application/x-msdownload", Buffer.from("x")), /not allowed/);
    });

    test("path-traversal in ids and file names is refused", async () => {
        await assert.rejects(() => server.ensureSession({ ...LOCATION, sessionId: "../escape" }), /not valid/);
        await assert.rejects(() => server.storeKnowledgeFile(LOCATION, "../escape.txt", "text/plain", Buffer.from("x")), /not valid/);
        await assert.rejects(() => server.storeKnowledgeFile(LOCATION, "sub/dir.txt", "text/plain", Buffer.from("x")), /not valid/);
    });

    test("deleteSession removes the entire session tree", async () => {
        await server.storeKnowledgeFile(LOCATION, "a.txt", "text/plain", Buffer.from("a"));
        await server.deleteSession(LOCATION);
        assert.deepEqual(await server.listKnowledgeFiles(LOCATION), []);
    });

    test("directories are owner-only on POSIX", { skip: process.platform === "win32" }, async () => {
        const sessionDir = await server.ensureSession(LOCATION);
        assert.equal((await stat(sessionDir)).mode & 0o777, 0o700);
    });
});
