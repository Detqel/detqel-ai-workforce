/**
 * The agent runtime is organised around named processes rather than pre-created agent personas. A user-facing
 * agent exists only when someone recruits or selects one for a discussion. These processes are the internal
 * capabilities that every discussion draws on, and each gets its own model mapping and LiteLLM virtual key.
 */
export const AGENT_RUNTIME_PROCESSES = {
    orchestration: "orchestration",
    rag: "rag",
    webSearch: "web-search",
    connectorOps: "connector-ops",
    embeddings: "embeddings",
} as const;

export type AgentRuntimeProcessId = (typeof AGENT_RUNTIME_PROCESSES)[keyof typeof AGENT_RUNTIME_PROCESSES];

export const AGENT_RUNTIME_PROCESS_IDS: ReadonlyArray<AgentRuntimeProcessId> = Object.values(AGENT_RUNTIME_PROCESSES);

/** SecretCipher purpose label for minted virtual keys; isolates them from provider-credential ciphertext. */
export const AGENT_RUNTIME_SECRET_PURPOSE = "litellm-virtual-keys";

/** Prefix for the gateway key alias so audit entries are recognisable and namespaced per workspace+process. */
export const VIRTUAL_KEY_ALIAS_PREFIX = "detqel";

/** Each process calls either the workspace's configured chat model or the managed embedding model. */
export const AGENT_MODEL_KINDS = { chat: "chat", embedding: "embedding" } as const;
export type AgentModelKind = (typeof AGENT_MODEL_KINDS)[keyof typeof AGENT_MODEL_KINDS];

export const AGENT_RUNTIME_PROCESS_MODEL_KINDS: Readonly<Record<AgentRuntimeProcessId, AgentModelKind>> = {
    [AGENT_RUNTIME_PROCESSES.orchestration]: AGENT_MODEL_KINDS.chat,
    [AGENT_RUNTIME_PROCESSES.rag]: AGENT_MODEL_KINDS.chat,
    [AGENT_RUNTIME_PROCESSES.webSearch]: AGENT_MODEL_KINDS.chat,
    [AGENT_RUNTIME_PROCESSES.connectorOps]: AGENT_MODEL_KINDS.chat,
    [AGENT_RUNTIME_PROCESSES.embeddings]: AGENT_MODEL_KINDS.embedding,
};

/**
 * Gateway model alias and deployment id per workspace and model kind. Both are deterministic, so a changed
 * configuration replaces the previous registration instead of adding another deployment behind the same name.
 */
export const agentModelAlias = (workspaceId: string, kind: AgentModelKind): string => `${VIRTUAL_KEY_ALIAS_PREFIX}-${workspaceId}-${kind}`;
export const agentModelDeploymentId = (workspaceId: string, kind: AgentModelKind): string => `${VIRTUAL_KEY_ALIAS_PREFIX}-${workspaceId}-${kind}`;

/** LiteLLM provider prefixes for the providers selectable in Configuration. */
export const LITELLM_PROVIDER_PREFIXES: Readonly<Record<string, string>> = {
    openai: "openai",
    anthropic: "anthropic",
    google: "gemini",
    groq: "groq",
    deepseek: "deepseek",
};

/** The embedding model served by the managed Ollama container, addressed through the gateway. */
export const AGENT_EMBEDDING_PROVIDER_PREFIX = "ollama";

/** Fingerprint of the configuration a workspace was provisioned with; a change triggers re-provisioning. */
export const AGENT_CONFIGURATION_FINGERPRINT = { algorithm: "sha256", encoding: "hex", separator: "\u0000" } as const;

export const AGENT_RUNTIME_ERRORS = {
    processUnknown: "An unknown agent runtime process was requested.",
    noConfiguredModel: "No AI model is configured. Add a provider and select a model in Configuration before using agents.",
    keyMissing: "The AI gateway key for this process is not available. Re-save the provider configuration.",
    noProviderKey: "The selected AI provider has no saved API key. Enter the key in Configuration and test the connection.",
    unsupportedProvider: "The selected AI provider cannot be used by agents yet. Choose OpenAI, Anthropic, Google, Groq, or DeepSeek in Configuration.",
    embeddingUnavailable: "The embedding service is not available. Restart the application so its managed services start.",
} as const;
