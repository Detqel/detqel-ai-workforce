import test, { afterEach, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Sql } from "postgres";
import { filesystemOperations, httpOperations, postgresOperations, readOnlyStatement } from "../../src/modules/connections/operations/data-operations.js";
import { CONNECTOR_OPERATIONS } from "../../src/constants/connectorOperationConstants.js";
import { AGENT_TOOL_LIMITS } from "../../src/constants/agentContextConstants.js";
import { AppError } from "../../src/shared/errors/app-error.js";

/**
 * A postgres-shaped spy exposing the unsafe() and begin() paths the operations use. It records each statement and
 * the mode of every transaction opened, and returns `rows` rows.
 */
function sqlSpy(rows = 1): Sql & { statements: string[]; transactions: string[] } {
    const statements: string[] = [];
    const transactions: string[] = [];
    const fn = (async () => []) as unknown as Sql & { statements: string[]; transactions: string[] };
    fn.statements = statements;
    fn.transactions = transactions;
    const unsafe = async (statement: string) => {
        statements.push(statement);
        return Array.from({ length: rows }, (_, index) => ({ id: index + 1 }));
    };
    Object.assign(fn, {
        unsafe,
        begin: async (mode: string, body: (transaction: { unsafe: typeof unsafe }) => Promise<unknown>) => {
            transactions.push(mode);
            return body({ unsafe });
        },
    });
    return fn;
}

describe("Postgres connector operations", () => {
    test("the query path runs read-only SQL in a read-only transaction with a row cap", async () => {
        const sql = sqlSpy();
        const execute = postgresOperations(sql);
        const result = await execute({ operation: CONNECTOR_OPERATIONS.query, parameters: { sql: "SELECT * FROM orders;" } });
        assert.equal(result.metadata?.rowCount, 1);
        assert.equal(result.metadata?.truncated, false);
        assert.deepEqual(sql.transactions, ["read only"]);
        assert.equal(sql.statements[0], `SELECT * FROM (\nSELECT * FROM orders\n) AS kin_read LIMIT ${AGENT_TOOL_LIMITS.maxRows + 1}`);
    });

    test("results beyond the row cap are cut and marked truncated", async () => {
        const execute = postgresOperations(sqlSpy(AGENT_TOOL_LIMITS.maxRows + 1));
        const result = await execute({ operation: CONNECTOR_OPERATIONS.query, parameters: { sql: "SELECT * FROM orders" } });
        assert.equal((result.data as unknown[]).length, AGENT_TOOL_LIMITS.maxRows);
        assert.equal(result.metadata?.truncated, true);
    });

    test("the query path rejects data-changing SQL", async () => {
        const execute = postgresOperations(sqlSpy());
        await assert.rejects(() => execute({ operation: CONNECTOR_OPERATIONS.query, parameters: { sql: "DELETE FROM orders" } }), /read-only SQL/);
        await assert.rejects(() => execute({ operation: CONNECTOR_OPERATIONS.query, parameters: { sql: "UPDATE orders SET x = 1" } }), /read-only SQL/);
    });

    test("read-only checks refuse second statements, side-effecting CTEs, server files and credentials", () => {
        const refused = [
            "SELECT 1; DROP TABLE orders",
            "WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone",
            "SHOW ALL",
            "EXPLAIN ANALYZE DELETE FROM orders",
            "SELECT pg_read_file('/etc/passwd')",
            "SELECT * FROM pg_ls_dir('.')",
            "SELECT rolpassword FROM pg_authid",
            "SELECT * FROM dblink('host=evil', 'select 1') AS t(x int)",
            "SELECT pg_sleep(60)",
            "SELECT set_config('default_transaction_read_only', 'off', false)",
            "SELECT * INTO copy_of_orders FROM orders",
            "SELECT nextval('orders_id_seq')",
        ];
        for (const statement of refused) assert.throws(() => readOnlyStatement(statement), AppError, statement);
        assert.equal(readOnlyStatement("  WITH t AS (SELECT 1 AS n) SELECT n FROM t ;  "), "WITH t AS (SELECT 1 AS n) SELECT n FROM t");
        assert.equal(readOnlyStatement("SELECT updated_at, created_by FROM orders"), "SELECT updated_at, created_by FROM orders", "column names that contain keywords are fine");
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

    test("KIN's own code and runtime folders cannot be read, even inside an allowed root", async () => {
        const previous = process.env.DETQEL_RUNTIME_DIR;
        process.env.DETQEL_RUNTIME_DIR = root;
        try {
            await writeFile(path.join(root, "kin-state.json"), "{}");
            const execute = filesystemOperations([root], "directory");
            await assert.rejects(() => execute({ operation: CONNECTOR_OPERATIONS.read, parameters: { path: path.join(root, "kin-state.json") } }), /belongs to the KIN application/);
            const backendFile = fileURLToPath(new URL("../../package.json", import.meta.url));
            const everything = filesystemOperations([path.parse(backendFile).root], "directory");
            await assert.rejects(() => everything({ operation: CONNECTOR_OPERATIONS.read, parameters: { path: backendFile } }), /belongs to the KIN application/);
        } finally {
            if (previous === undefined) delete process.env.DETQEL_RUNTIME_DIR;
            else process.env.DETQEL_RUNTIME_DIR = previous;
        }
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
