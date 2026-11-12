// Loads backend.env into this process before the environment is validated. Installed copies start from the bundled
// template, which cannot carry per-installation secrets, so missing ones are generated once and written back: they must
// stay stable, because a new session secret signs everyone out and a new connector key loses saved credentials.
import { randomBytes } from "node:crypto";
import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { parse } from "dotenv";
import { DESKTOP_CONFIGURATION, DESKTOP_PLATFORM, DESKTOP_PROTECTED_ENVIRONMENT_KEYS } from "../constants/desktopConstants.js";

export interface DesktopConfigurationResult {
    /** Names (never values) of the secrets generated and saved during this start. */
    generatedKeys: string[];
}

export async function loadDesktopConfiguration(configPath: string): Promise<DesktopConfigurationResult> {
    const contents = await readFile(configPath, "utf8");
    for (const [key, value] of Object.entries(parse(contents))) {
        // Blank template entries mean "not configured", so they must not shadow the fallbacks below.
        if (value !== "" && !DESKTOP_PROTECTED_ENVIRONMENT_KEYS.includes(key) && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }

    const generated: Record<string, string> = {};
    for (const [key, bytes] of Object.entries(DESKTOP_CONFIGURATION.generatedSecrets)) {
        if (!process.env[key]) generated[key] = randomBytes(bytes).toString(DESKTOP_CONFIGURATION.generatedSecretEncoding);
    }
    // Saved before use: running on secrets that the next start would replace would strand the data they protect.
    if (Object.keys(generated).length) await saveConfigurationValues(configPath, contents, generated);
    Object.assign(process.env, generated);

    for (const [key, value] of Object.entries(DESKTOP_CONFIGURATION.defaults)) {
        if (!process.env[key]) process.env[key] = value;
    }
    const embeddedProductKey = process.env[DESKTOP_CONFIGURATION.embeddedProductKey];
    delete process.env[DESKTOP_CONFIGURATION.embeddedProductKey];
    if (!process.env[DESKTOP_CONFIGURATION.productKey] && embeddedProductKey) {
        process.env[DESKTOP_CONFIGURATION.productKey] = embeddedProductKey;
    }
    return { generatedKeys: Object.keys(generated) };
}

/** Fills blank `KEY=` lines in place, appends the rest, and replaces the file atomically. */
async function saveConfigurationValues(configPath: string, contents: string, values: Record<string, string>): Promise<void> {
    const lineEnding = contents.includes("\r\n") ? "\r\n" : "\n";
    let updated = contents;
    const appended: string[] = [];
    for (const [key, value] of Object.entries(values)) {
        // Only blank or absent keys reach here, so every existing assignment of this key is an empty one.
        const assignment = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=.*$`, "gm");
        const replaced = updated.replace(assignment, () => `${key}=${value}`);
        if (replaced !== updated) updated = replaced;
        else appended.push(`${key}=${value}`);
    }
    if (appended.length) {
        if (updated.length && !updated.endsWith("\n")) updated += lineEnding;
        updated += [DESKTOP_CONFIGURATION.generatedComment, ...appended].join(lineEnding) + lineEnding;
    }

    const temporaryPath = `${configPath}.${process.pid}.tmp`;
    try {
        await writeFile(temporaryPath, updated, { encoding: "utf8", mode: DESKTOP_CONFIGURATION.fileMode, flag: "wx" });
        await rename(temporaryPath, configPath);
    } catch (error) {
        await rm(temporaryPath, { force: true });
        throw error;
    }
    if (process.platform !== DESKTOP_PLATFORM.windows) await chmod(configPath, DESKTOP_CONFIGURATION.fileMode);
}
