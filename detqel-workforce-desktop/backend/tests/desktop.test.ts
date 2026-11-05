import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { testConfig } from "./fixtures/config.js";
import { buildApp } from "../src/app.js";
import type { ApplicationServices } from "../src/bootstrap/services.js";
import { prepareInfrastructurePorts } from "../src/desktop/infrastructure/infrastructure-ports.js";
import { PRIVATE_PORT_RANGE } from "../src/constants/networkConstants.js";
import { infrastructureDirectory, infrastructureOwnershipFilter, infrastructureRuntimeId } from "../src/desktop/infrastructure/infrastructure-configuration.js";

test("desktop token protects health, documentation, and feature route scopes", async () => {
    const token = "12345678-1234-1234-1234-123456789012";
    const app = await buildApp({
        config: testConfig,
        desktopToken: token, logger: false,
        services: { health: { check: async () => ({ database: "connected" }) }, connections: { close: async () => {} } } as unknown as ApplicationServices,
    });
    try {
        for (const url of ["/health/live", "/docs/json", "/api/settings/providers"]) {
            assert.equal((await app.inject(url)).statusCode, 401, url);
            assert.equal((await app.inject({ url, headers: { "x-detqel-desktop-token": "incorrect" } })).statusCode, 401);
        }
        assert.equal((await app.inject({ url: "/health/live", headers: { "x-detqel-desktop-token": token } })).statusCode, 200);
        assert.equal((await app.inject({ url: "/docs/json", headers: { "x-detqel-desktop-token": token } })).statusCode, 200);
    } finally { await app.close(); }
});

test("prepareInfrastructurePorts reallocates unavailable saved ports without error", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "detqel-ports-test-"));
    try {
        const signal = new AbortController().signal;
        const initial = await prepareInfrastructurePorts({ directory: tempDir, signal });
        assert.ok(initial.litellm >= PRIVATE_PORT_RANGE.minimum && initial.litellm <= PRIVATE_PORT_RANGE.maximum);
        assert.ok(initial.milvus >= PRIVATE_PORT_RANGE.minimum && initial.milvus <= PRIVATE_PORT_RANGE.maximum);
        assert.ok(initial.applicationDatabase >= PRIVATE_PORT_RANGE.minimum && initial.applicationDatabase <= PRIVATE_PORT_RANGE.maximum);

        const reused = await prepareInfrastructurePorts({ directory: tempDir, signal });
        assert.deepEqual(reused, initial);

        const blocker = createServer();
        await new Promise<void>((resolve, reject) => {
            blocker.listen({ host: "127.0.0.1", port: initial.litellm, exclusive: true }, () => resolve());
            blocker.once("error", reject);
        });

        try {
            const reallocated = await prepareInfrastructurePorts({ directory: tempDir, signal });
            assert.notEqual(reallocated.litellm, initial.litellm);
            assert.equal(reallocated.milvus, initial.milvus);
            assert.equal(reallocated.applicationDatabase, initial.applicationDatabase);
            assert.ok(reallocated.litellm >= PRIVATE_PORT_RANGE.minimum && reallocated.litellm <= PRIVATE_PORT_RANGE.maximum);

            const savedOnDisk = JSON.parse(await readFile(path.join(tempDir, "ports.json"), "utf8"));
            assert.equal(savedOnDisk.litellm, reallocated.litellm);
            assert.equal(savedOnDisk.milvus, reallocated.milvus);
            assert.equal(savedOnDisk.applicationDatabase, reallocated.applicationDatabase);
        } finally {
            await new Promise<void>(resolve => blocker.close(() => resolve()));
        }
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
});

test("Docker shutdown selects containers by this installation's ownership label, never by name", () => {
    const first = path.resolve(tmpdir(), "detqel-runtime-a");
    const second = path.resolve(tmpdir(), "detqel-runtime-b");
    const filter = infrastructureOwnershipFilter(first);
    assert.match(filter, /^label=com\.detqel\.desktop\.runtime=[a-f0-9]{64}$/);
    assert.equal(filter, `label=com.detqel.desktop.runtime=${infrastructureRuntimeId(infrastructureDirectory(first))}`);
    assert.equal(filter, infrastructureOwnershipFilter(first), "the filter is stable for one runtime directory");
    assert.notEqual(filter, infrastructureOwnershipFilter(second), "another installation's containers are not matched");
    assert.ok(!filter.startsWith("name="));
});
