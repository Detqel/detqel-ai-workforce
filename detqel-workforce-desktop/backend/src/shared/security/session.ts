import { BEARER_AUTHORIZATION_PREFIX, MAX_AUTHORIZATION_HEADER_LENGTH, SESSION_CRYPTO } from "../../constants/authConstants.js";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";

const claimsSchema = z.object({ sub: z.string().uuid(), exp: z.number().int(), nonce: z.string().min(1) }).strict();

export class SessionService {
    private readonly key: Buffer;

    constructor(secret: string, private readonly lifetimeSeconds: number) {
        this.key = Buffer.from(secret, "base64");
        if (this.key.length !== SESSION_CRYPTO.keyBytes) throw new Error("AUTH_SESSION_SECRET must contain 32 base64-encoded bytes");
    }

    issue(userId: string): { accessToken: string; expiresAt: string } {
        const expires = Math.floor(Date.now() / SESSION_CRYPTO.millisecondsPerSecond) + this.lifetimeSeconds;
        const payload = Buffer.from(JSON.stringify({ sub: userId, exp: expires, nonce: randomBytes(SESSION_CRYPTO.nonceBytes).toString(SESSION_CRYPTO.encoding) })).toString(SESSION_CRYPTO.encoding);
        const signature = createHmac(SESSION_CRYPTO.algorithm, this.key).update(payload).digest(SESSION_CRYPTO.encoding);
        return { accessToken: `${payload}.${signature}`, expiresAt: new Date(expires * SESSION_CRYPTO.millisecondsPerSecond).toISOString() };
    }

    verify(authorization: string | undefined): string {
        if (!authorization?.startsWith(BEARER_AUTHORIZATION_PREFIX) || authorization.length > MAX_AUTHORIZATION_HEADER_LENGTH) throw new AppError(401, "Sign in to manage connections");
        const parts = authorization.slice(BEARER_AUTHORIZATION_PREFIX.length).split(".");
        if (parts.length !== 2) throw new AppError(401, "Invalid session");
        const [payload, signature] = parts;
        const actual = Buffer.from(signature, SESSION_CRYPTO.encoding);
        const expected = createHmac(SESSION_CRYPTO.algorithm, this.key).update(payload).digest();
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AppError(401, "Invalid session");
        try {
            const claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, SESSION_CRYPTO.encoding).toString("utf8")));
            if (claims.exp <= Math.floor(Date.now() / SESSION_CRYPTO.millisecondsPerSecond)) throw new Error("expired");
            return claims.sub;
        } catch {
            throw new AppError(401, "Your session expired. Sign in again to manage connections");
        }
    }
}
