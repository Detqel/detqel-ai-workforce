import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";

const claimsSchema = z.object({ sub: z.string().uuid(), exp: z.number().int(), nonce: z.string().min(1) }).strict();

export class SessionService {
    private readonly key: Buffer;

    constructor(secret: string, private readonly lifetimeSeconds: number) {
        this.key = Buffer.from(secret, "base64");
        if (this.key.length !== 32) throw new Error("AUTH_SESSION_SECRET must contain 32 base64-encoded bytes");
    }

    issue(userId: string): { accessToken: string; expiresAt: string } {
        const expires = Math.floor(Date.now() / 1000) + this.lifetimeSeconds;
        const payload = Buffer.from(JSON.stringify({ sub: userId, exp: expires, nonce: randomBytes(16).toString("base64url") })).toString("base64url");
        const signature = createHmac("sha256", this.key).update(payload).digest("base64url");
        return { accessToken: `${payload}.${signature}`, expiresAt: new Date(expires * 1000).toISOString() };
    }

    verify(authorization: string | undefined): string {
        if (!authorization?.startsWith("Bearer ") || authorization.length > 4096) throw new AppError(401, "Sign in to manage connections");
        const parts = authorization.slice(7).split(".");
        if (parts.length !== 2) throw new AppError(401, "Invalid session");
        const [payload, signature] = parts;
        const actual = Buffer.from(signature, "base64url");
        const expected = createHmac("sha256", this.key).update(payload).digest();
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AppError(401, "Invalid session");
        try {
            const claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
            if (claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("expired");
            return claims.sub;
        } catch {
            throw new AppError(401, "Your session expired. Sign in again to manage connections");
        }
    }
}
