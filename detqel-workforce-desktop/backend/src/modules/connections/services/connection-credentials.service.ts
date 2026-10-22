import { CONNECTOR_CRYPTO } from "../../../constants/connectionConstants.js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConfigurationSchema } from "../../../shared/types/connector-catalog.js";

export class ConnectionCredentialsService {
    private readonly key: Buffer;

    constructor(encodedKey: string) {
        this.key = Buffer.from(encodedKey, "base64");
        if (this.key.length !== CONNECTOR_CRYPTO.keyBytes) throw new Error("CONNECTOR_ENCRYPTION_KEY must contain 32 base64-encoded bytes");
    }

    split(schema: ConfigurationSchema, configuration: Record<string, unknown>) {
        const publicConfiguration: Record<string, unknown> = {};
        const secrets: Record<string, unknown> = {};
        for (const [name, value] of Object.entries(configuration)) {
            if (schema.properties[name]?.["x-secret"]) secrets[name] = value;
            else publicConfiguration[name] = value;
        }
        return { publicConfiguration, secrets };
    }

    encrypt(secrets: Record<string, unknown>, workspaceId: string): string | null {
        if (!Object.keys(secrets).length) return null;
        const iv = randomBytes(CONNECTOR_CRYPTO.ivBytes);
        const cipher = createCipheriv(CONNECTOR_CRYPTO.algorithm, this.key, iv);
        cipher.setAAD(Buffer.from(workspaceId));
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(secrets), "utf8"), cipher.final()]);
        return [CONNECTOR_CRYPTO.envelopePrefix, CONNECTOR_CRYPTO.envelopeVersion, iv.toString(CONNECTOR_CRYPTO.encoding), cipher.getAuthTag().toString(CONNECTOR_CRYPTO.encoding), ciphertext.toString(CONNECTOR_CRYPTO.encoding)].join(CONNECTOR_CRYPTO.envelopeSeparator);
    }

    decrypt(envelope: string | null, workspaceId: string): Record<string, unknown> {
        if (envelope === null) return {};
        const [prefix, version, iv, tag, ciphertext, extra] = envelope.split(CONNECTOR_CRYPTO.envelopeSeparator);
        if (prefix !== CONNECTOR_CRYPTO.envelopePrefix || version !== CONNECTOR_CRYPTO.envelopeVersion || !iv || !tag || !ciphertext || extra) throw new AppError(409, "This legacy connection must be reconfigured before it can reconnect");
        try {
            const decipher = createDecipheriv(CONNECTOR_CRYPTO.algorithm, this.key, Buffer.from(iv, CONNECTOR_CRYPTO.encoding));
            decipher.setAAD(Buffer.from(workspaceId));
            decipher.setAuthTag(Buffer.from(tag, CONNECTOR_CRYPTO.encoding));
            return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, CONNECTOR_CRYPTO.encoding)), decipher.final()]).toString("utf8")) as Record<string, unknown>;
        } catch {
            throw new AppError(500, "Stored connector credentials could not be decrypted");
        }
    }
}
