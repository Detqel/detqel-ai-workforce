/**
 * agents.config.json maps every agent runtime process to the model it uses and the gateway virtual-key
 * reference that authorises its calls. It is written into the writable runtime directory (not bundled) and
 * regenerated whenever the configured provider/model changes. For now every process maps to the single
 * configured model; per-process model selection will replace the shared mapping later.
 */
export const AGENTS_CONFIG_FILE = "agents.config.json";

export const AGENTS_CONFIG_VERSION = 1;

/** Private-directory and private-file permission modes, matching the infrastructure runtime storage policy. */
export const AGENTS_CONFIG_FILE_MODES = { directory: 0o700, file: 0o600 } as const;

export const AGENTS_CONFIG_TEMP = { prefix: ".agents-config-", suffix: ".tmp", randomBytes: 8, encoding: "hex" } as const;

export const AGENTS_CONFIG_ERRORS = {
    missing: "The agent runtime configuration has not been generated yet.",
    unreadable: "The agent runtime configuration could not be read.",
    malformed: "The agent runtime configuration is malformed or from an unsupported version.",
    incompleteProcesses: "The agent runtime configuration is missing one or more required processes.",
} as const;
