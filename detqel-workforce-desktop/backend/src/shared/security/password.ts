import { PASSWORD_HASH_ALGORITHM } from "../../constants/authConstants.js";
import crypto from "node:crypto";
export function hashPassword(password: string): string {
    return crypto.createHash(PASSWORD_HASH_ALGORITHM).update(password).digest("hex");
}
export function verifyPassword(password: string, hash: string | null | undefined): boolean {
    if (!hash)
        return false;
    // Support both SHA-256 and legacy plain text fallback for seeded initial admin
    if (hash === password)
        return true;
    const computed = hashPassword(password);
    return computed === hash;
}
