import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { SECRET_CRYPTO, SECRET_HINT } from "../../constants/authConstants.js";
import { AppError } from "../errors/app-error.js";

const ENVELOPE_START = `${SECRET_CRYPTO.envelopePrefix}${SECRET_CRYPTO.envelopeSeparator}${SECRET_CRYPTO.envelopeVersion}${SECRET_CRYPTO.envelopeSeparator}`;

/**
 * Encrypts short secrets for storage. The subkey is derived from the master key and a purpose label, and every
 * value is bound to a context (for example the owning row), so ciphertext copied to another row fails to decrypt.
 */
export class SecretCipher {
    private readonly key: Buffer;

    constructor(encodedMasterKey: string, purpose: string) {
        const master = Buffer.from(encodedMasterKey, "base64");
        if (master.length !== SECRET_CRYPTO.keyBytes) throw new Error("The master encryption key must contain 32 base64-encoded bytes");
        this.key = Buffer.from(hkdfSync(SECRET_CRYPTO.derivation.digest, master, SECRET_CRYPTO.derivation.salt, purpose, SECRET_CRYPTO.keyBytes));
    }

    static isEnvelope(value: string | null | undefined): value is string {
        return typeof value === "string" && value.startsWith(ENVELOPE_START);
    }

    encrypt(plaintext: string, context: string): string {
        const iv = randomBytes(SECRET_CRYPTO.ivBytes);
        const cipher = createCipheriv(SECRET_CRYPTO.algorithm, this.key, iv);
        cipher.setAAD(Buffer.from(context));
        const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
        return [
            SECRET_CRYPTO.envelopePrefix,
            SECRET_CRYPTO.envelopeVersion,
            iv.toString(SECRET_CRYPTO.encoding),
            cipher.getAuthTag().toString(SECRET_CRYPTO.encoding),
            ciphertext.toString(SECRET_CRYPTO.encoding),
        ].join(SECRET_CRYPTO.envelopeSeparator);
    }

    decrypt(envelope: string, context: string): string {
        const [prefix, version, iv, tag, ciphertext, extra] = envelope.split(SECRET_CRYPTO.envelopeSeparator);
        if (prefix !== SECRET_CRYPTO.envelopePrefix || version !== SECRET_CRYPTO.envelopeVersion || !iv || !tag || !ciphertext || extra !== undefined) {
            throw new AppError(500, "Stored credentials are in an unsupported format");
        }
        try {
            const decipher = createDecipheriv(SECRET_CRYPTO.algorithm, this.key, Buffer.from(iv, SECRET_CRYPTO.encoding));
            decipher.setAAD(Buffer.from(context));
            decipher.setAuthTag(Buffer.from(tag, SECRET_CRYPTO.encoding));
            return Buffer.concat([decipher.update(Buffer.from(ciphertext, SECRET_CRYPTO.encoding)), decipher.final()]).toString("utf8");
        } catch {
            throw new AppError(500, "Stored credentials could not be decrypted");
        }
    }
}

/** The last few characters of a secret, or null when it is too short to reveal any part of it safely. */
export function secretHint(secret: string): string | null {
    return secret.length >= SECRET_HINT.minimumLength ? secret.slice(-SECRET_HINT.visibleCharacters) : null;
}
