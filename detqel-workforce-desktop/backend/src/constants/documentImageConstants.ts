export const DOCUMENT_IMAGE_PROCESS = "document-images";

/** Explicit capabilities: unsupported providers are errors, never model substitutions. */
export const DOCUMENT_IMAGE_MODELS: Readonly<Record<string, { readonly model: string; readonly provider: "openai" | "google" }>> = {
    openai: { model: "openai/gpt-image-2.5-sunburst", provider: "openai" },
    google: { model: "gemini/gemini-3-pro-image", provider: "google" },
};

export const DOCUMENT_RENDER_LIMITS = {
    markdownCharacters: 300_000,
    figures: 6,
    imagePromptCharacters: 6_000,
    imageBytes: 12 * 1024 * 1024,
    imageResponseBytes: 18 * 1024 * 1024,
    documentImageBytes: 48 * 1024 * 1024,
    exportBytes: 64 * 1024 * 1024,
    imagePixels: 16_000_000,
    imageTimeoutMs: 300_000,
    formulaCharacters: 4_096,
    formulas: 400,
    pages: 500,
    tableColumns: 10,
    tableRows: 2_000,
} as const;

export const DOCUMENT_ASSET_PATTERN = /^kin-asset:([a-f0-9]{64}\.png)$/;
export const DOCUMENT_IMAGE_ERRORS = {
    unsupportedProvider: "The configured provider does not offer document image generation. OpenAI and Google are supported; the document cannot be completed with its required images using this provider.",
    generationFailed: "The image model could not generate the required document image. No substitute image or text diagram was used.",
    invalidImage: "A document image is invalid, unsupported, or exceeds the allowed image size.",
    unavailableAsset: "A required document image could not be loaded from this discussion.",
    invalidDocument: "The document contains incomplete image instructions, unsupported diagrams, or invalid formulas and cannot be handed over.",
    contentTooLarge: "The document exceeds the supported content or layout limits.",
} as const;
