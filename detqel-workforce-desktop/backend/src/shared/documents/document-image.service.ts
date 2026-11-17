import { createHmac } from "node:crypto";
import sharp from "sharp";
import { AppError } from "../errors/app-error.js";
import type { AgentModelConfigurationResolver } from "../agents/agent-model.provisioner.js";
import type { LiteLlmClient } from "../agents/litellm.client.js";
import type { VirtualKeyRegistry } from "../agents/virtual-key.registry.js";
import { DOCUMENT_IMAGE_ERRORS, DOCUMENT_IMAGE_MODELS, DOCUMENT_IMAGE_PROCESS, DOCUMENT_RENDER_LIMITS } from "../../constants/documentImageConstants.js";

export class DocumentImageService {
    private readonly provisioning = new Map<string, Promise<void>>();

    constructor(private readonly gateway: LiteLlmClient, private readonly keys: VirtualKeyRegistry,
        private readonly configuration: AgentModelConfigurationResolver, private readonly fingerprintSecret: string) {}

    async capability(workspaceId: string): Promise<{ supported: boolean; model?: string }> {
        const configuration = await this.configuration(workspaceId);
        const selected = DOCUMENT_IMAGE_MODELS[configuration.providerId];
        return selected ? { supported: true, model: selected.model } : { supported: false };
    }

    async generate(workspaceId: string, prompt: string, aspectRatio: "3:2" | "1:1" | "2:3", signal?: AbortSignal) {
        signal?.throwIfAborted();
        const configuration = await this.configuration(workspaceId);
        const selected = DOCUMENT_IMAGE_MODELS[configuration.providerId];
        if (!selected) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.unsupportedProvider);
        const fingerprint = createHmac("sha256", this.fingerprintSecret).update(JSON.stringify([configuration.providerId, selected.model, configuration.apiKey])).digest("hex");
        const pendingKey = workspaceId + ":" + fingerprint;
        let provisioning = this.provisioning.get(pendingKey);
        if (!provisioning) {
            provisioning = this.keys.provisionDocumentImages(workspaceId, { providerModel: selected.model, providerApiKey: configuration.apiKey }, fingerprint, signal)
                .finally(() => this.provisioning.delete(pendingKey));
            this.provisioning.set(pendingKey, provisioning);
        }
        await provisioning;
        signal?.throwIfAborted();
        const key = await this.keys.resolveProcessKey(workspaceId, DOCUMENT_IMAGE_PROCESS);
        const result = await this.gateway.generateImage(key.virtualKey, { model: key.modelAlias, prompt, provider: selected.provider, aspectRatio }, signal);
        return { ...result, contents: await normalizeDocumentImage(result.contents), model: selected.model };
    }
}

/** Decode, bound pixel expansion, remove metadata, and store one known raster format. */
export async function normalizeDocumentImage(contents: Buffer): Promise<Buffer> {
    if (!contents.length || contents.length > DOCUMENT_RENDER_LIMITS.imageBytes) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidImage);
    const png = contents.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = contents[0] === 255 && contents[1] === 216 && contents[2] === 255;
    const webp = contents.toString("ascii", 0, 4) === "RIFF" && contents.toString("ascii", 8, 12) === "WEBP";
    if (!png && !jpeg && !webp) throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidImage);
    try {
        const decoder = sharp(contents, { limitInputPixels: DOCUMENT_RENDER_LIMITS.imagePixels, animated: false, failOn: "warning" });
        const metadata = await decoder.metadata();
        if (!metadata.width || !metadata.height || !["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Unsupported raster image");
        const normalized = await decoder.rotate().png({ compressionLevel: 9 }).toBuffer();
        if (normalized.length > DOCUMENT_RENDER_LIMITS.imageBytes) throw new Error("Image size limit");
        return normalized;
    } catch { throw new AppError(422, DOCUMENT_IMAGE_ERRORS.invalidImage); }
}
