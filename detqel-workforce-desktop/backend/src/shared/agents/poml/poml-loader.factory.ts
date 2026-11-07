import { fileURLToPath } from "node:url";
import { isAbsolute, join } from "node:path";
import { PomlLoader } from "./loader.js";
import { DESKTOP_ENVIRONMENT_KEYS } from "../../../constants/desktopConstants.js";
import { POML_BUNDLED_RELATIVE_URL, POML_RUNTIME_DIRECTORY } from "../../../constants/pomlConstants.js";

/**
 * Builds the POML loader from the bundled read-only prompts shipped beside the compiled backend and the
 * writable per-user prompt directory. In the desktop shell the runtime directory is the hardened private
 * runtime path; otherwise a local directory under the backend is used for standalone and development runs.
 */
export function createPomlLoader(): PomlLoader {
    const bundledDirectory = fileURLToPath(new URL(POML_BUNDLED_RELATIVE_URL, import.meta.url));
    const desktopRuntime = process.env[DESKTOP_ENVIRONMENT_KEYS.runtimeDirectory];
    const runtimeDirectory = desktopRuntime && isAbsolute(desktopRuntime)
        ? join(desktopRuntime, POML_RUNTIME_DIRECTORY)
        : fileURLToPath(new URL(`../../../../.local/${POML_RUNTIME_DIRECTORY}/`, import.meta.url));
    return new PomlLoader({ bundledDirectory, runtimeDirectory });
}
