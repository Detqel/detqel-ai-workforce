import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";
import { PromptLoader } from "./loader.js";
import { DESKTOP_ENVIRONMENT_KEYS } from "../../../constants/desktopConstants.js";
import { PROMPT_AGENT_DIRECTORY, PROMPT_BUNDLED_RELATIVE_URL, PROMPT_RUNTIME_DIRECTORY } from "../../../constants/promptConstants.js";

export function createPromptLoader(): PromptLoader {
    const bundledDirectory = fileURLToPath(new URL(PROMPT_BUNDLED_RELATIVE_URL, import.meta.url));
    const desktopRuntime = process.env[DESKTOP_ENVIRONMENT_KEYS.runtimeDirectory];
    if (desktopRuntime && !isAbsolute(desktopRuntime)) throw new Error("The desktop prompt runtime directory must be absolute.");
    const runtimeDirectory = desktopRuntime
        ? join(desktopRuntime, PROMPT_RUNTIME_DIRECTORY, PROMPT_AGENT_DIRECTORY)
        : join(bundledDirectory, PROMPT_AGENT_DIRECTORY);
    return new PromptLoader({ bundledDirectory, runtimeDirectory });
}
