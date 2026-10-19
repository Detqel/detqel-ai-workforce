import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { envSchema } from "../src/config/env.js";
import type { ApplicationServices } from "../src/bootstrap/services.js";

test("desktop token protects health, documentation, and feature route scopes", async () => {
    const token = "12345678-1234-1234-1234-123456789012";
    const app = await buildApp({
        config: envSchema.parse({ DATABASE_URL: "postgres://test:test@localhost:5432/test", NODE_ENV: "test" }),
        desktopToken: token, logger: false,
        services: { health: { check: async () => ({ database: "connected" }) } } as unknown as ApplicationServices,
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
