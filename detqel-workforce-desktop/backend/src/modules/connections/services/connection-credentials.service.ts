import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConfigurationSchema } from "../../../shared/types/connector-catalog.js";

export class ConnectionCredentialsService {
    private readonly key: Buffer;

    constructor(encodedKey: string) {
        this.key = Buffer.from(encodedKey, "base64");
        if (this.key.length !== 32) throw new Error("CONNECTOR_ENCRYPTION_KEY must contain 32 base64-encoded bytes");
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
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.key, iv);
        cipher.setAAD(Buffer.from(workspaceId));
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(secrets), "utf8"), cipher.final()]);
        return ["enc", "v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
    }

    decrypt(envelope: string | null, workspaceId: string): Record<string, unknown> {
        if (envelope === null) return {};
        const [prefix, version, iv, tag, ciphertext, extra] = envelope.split(":");
        if (prefix !== "enc" || version !== "v1" || !iv || !tag || !ciphertext || extra) throw new AppError(409, "This legacy connection must be reconfigured before it can reconnect");
        try {
            const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
            decipher.setAAD(Buffer.from(workspaceId));
            decipher.setAuthTag(Buffer.from(tag, "base64url"));
            return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8")) as Record<string, unknown>;
        } catch {
            throw new AppError(500, "Stored connector credentials could not be decrypted");
        }
    }
}
