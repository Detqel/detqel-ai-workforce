import test, { afterEach, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Sql } from "postgres";
import { filesystemOperations, httpOperations, postgresOperations } from "../../src/modules/connections/operations/data-operations.js";
import { CONNECTOR_OPERATIONS } from "../../src/constants/connectorOperationConstants.js";

/** A postgres-shaped spy exposing only the unsafe() path the operations use, recording the statements run. */
function sqlSpy(): Sql & { statements: string[] } {
    const statements: string[] = [];
    const fn = (async () => []) as unknown as Sql & { statements: string[] };
    fn.statements = statements;
    (fn as unknown as { unsafe: (s: string) => Promise<unknown[]> }).unsafe = async (statement: string) => {
        statements.push(statement);
        return [{ id: 1 }];
    };
    return fn;
}

describe("Postgres connector operations", () => {
    test("the query path runs read-only SQL", async () => {
        const sql = sqlSpy();
        const execute = postgresOperations(sql);
        const result = await execute({ operation: CONNECTOR_OPERATIONS.query, parameters: { sql: "SELECT * FROM orders" } });
        assert.equal(result.metadata?.rowCount, 1);
        assert.equal(sql.statements.length, 1);
    });

    test("the query path rejects data-changing SQL", async () => {
        const execute = postgresOperations(sqlSpy());
        await assert.rejects(() => execute({ operation: CONNECTOR_OPERATIONS.query, parameters: { sql: "DELETE FROM orders" } }), /read-only SQL/);
        await assert.rejects(() => execute({ operation: CONNECTOR_OPERATIONS.query, parameters: { sql: "UPDATE orders SET x = 1" } }), /read-only SQL/);
    });

    test("write/update/delete run the supplied statement and flag the result as mutating", async () => {
        const sql = sqlSpy();
        const execute = postgresOperations(sql);
        const result = await execute({ operation: CONNECTOR_OPERATIONS.delete, parameters: { sql: "DELETE FROM orders WHERE id = $1", params: [1] } });
        assert.equal(result.metadata?.mutating, true);
        assert.equal(sql.statements[0], "DELETE FROM orders WHERE id = $1");
    });
});

describe("HTTP connector operations", () => {
    const originalFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = originalFetch; });

    test("read performs a GET and parses JSON", async () => {
        let method = "";
        globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { method = init?.method ?? "GET"; return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as typeof fetch;
        const execute = httpOperations(new URL("https://api.example.test/v1"), new Headers(), 1000);
        const result = await execute({ operation: CONNECTOR_OPERATIONS.read, parameters: {} });
        assert.equal(method, "GET");
        assert.deepEqual(result.data, { ok: true });
    });

    test("write performs a POST with a JSON body", async () => {
        let method = "";
        globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { method = init?.method ?? ""; return new Response("{}", { status: 201 }); }) as typeof fetch;
        const execute = httpOperations(new URL("https://api.example.test/v1"), new Headers(), 1000);
        const result = await execute({ operation: CONNECTOR_OPERATIONS.write, parameters: { body: { a: 1 } } });
        assert.equal(method, "POST");
        assert.equal(result.metadata?.status, 201);
    });

    test("a path parameter may not leave the connection origin", async () => {
        globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;
        const execute = httpOperations(new URL("https://api.example.test/v1"), new Headers(), 1000);
        await assert.rejects(() => execute({ operation: CONNECTOR_OPERATIONS.read, parameters: { path: "https://evil.test/steal" } }), /stay on the connection's origin/);
    });
});

describe("Filesystem connector operations", () => {
    let root: string;
    beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "detqel-fs-ops-")); });
    afterEach(async () => { await rm(root, { recursive: true, force: true }); });

    test("read returns file contents within an allowed root", async () => {
        await writeFile(path.join(root, "note.txt"), "hello");
        const execute = filesystemOperations([root], "file");
        const result = await execute({ operation: CONNECTOR_OPERATIONS.read, parameters: { path: path.join(root, "note.txt") } });
        assert.equal(result.data, "hello");
    });

    test("write creates a file inside an allowed directory and is flagged mutating", async () => {
        const execute = filesystemOperations([root], "directory");
        const result = await execute({ operation: CONNECTOR_OPERATIONS.write, parameters: { directory: root, name: "out.txt", content: "data" } });
        assert.equal(result.metadata?.mutating, true);
        assert.equal(await readFile(path.join(root, "out.txt"), "utf8"), "data");
    });

    test("a write file name may not contain path separators", async () => {
        const execute = filesystemOperations([root], "directory");
        await assert.rejects(() => execute({ operation: CONNECTOR_OPERATIONS.write, parameters: { directory: root, name: "../escape.txt", content: "x" } }), /without path separators/);
    });

    test("reading a path outside the allowed roots is refused", async () => {
        const other = await mkdtemp(path.join(tmpdir(), "detqel-fs-other-"));
        try {
            await writeFile(path.join(other, "secret.txt"), "s");
            const execute = filesystemOperations([root], "file");
            await assert.rejects(() => execute({ operation: CONNECTOR_OPERATIONS.read, parameters: { path: path.join(other, "secret.txt") } }), /outside the operator-configured roots/);
        } finally {
            await rm(other, { recursive: true, force: true });
        }
    });
});
