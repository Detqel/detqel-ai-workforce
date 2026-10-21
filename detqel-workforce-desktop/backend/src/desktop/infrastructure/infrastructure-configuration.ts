import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { DesktopInfrastructureError } from "./infrastructure-error.js";
import { runInfrastructureProcess } from "./infrastructure-process.js";

export interface InfrastructureCredentials {
    version: 1;
    litellmMasterKey: string;
    litellmSaltKey: string;
    postgresUsername: string;
    postgresPassword: string;
    minioAccessKey: string;
    minioSecretKey: string;
    milvusRootPassword: string;
}

export function infrastructureStackName(runtimeDirectory: string): string {
    const absolute = resolve(runtimeDirectory);
    const canonical = process.platform === "win32" ? absolute.toLowerCase() : absolute;
    return `detqel-workforce-${createHash("sha256").update(canonical).digest("hex").slice(0, 12)}`;
}

export async function preparePrivateInfrastructureDirectory(runtimeDirectory: string, signal: AbortSignal): Promise<string> {
    if (!isAbsolute(runtimeDirectory)) throw new DesktopInfrastructureError("Desktop infrastructure requires an absolute private runtime directory.");
    const directory = join(resolve(runtimeDirectory), "infrastructure");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
        await chmod(directory, 0o700);
        return directory;
    }
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot) throw new DesktopInfrastructureError("Windows system tools are unavailable. Restart the application from your Windows user session.");
    const systemDirectory = join(systemRoot, "System32");
    const user = await runInfrastructureProcess(join(systemDirectory, "whoami.exe"), ["/user", "/fo", "csv", "/nh"], {
        signal, timeoutMs: 15_000, failureMessage: "The Windows user identity could not be resolved for private infrastructure storage.",
    });
    const sid = /\bS-\d-(?:\d+-)*\d+\b/.exec(user)?.[0];
    if (!sid) throw new DesktopInfrastructureError("The Windows user identity could not be resolved for private infrastructure storage.");
    await runInfrastructureProcess(join(systemDirectory, "icacls.exe"), [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], {
        signal, timeoutMs: 15_000, failureMessage: "Private infrastructure storage permissions could not be applied to your Windows user account.",
    });
    return directory;
}

export async function readInfrastructureCredentials(directory: string): Promise<InfrastructureCredentials | null> {
    let data: string;
    try { data = await readFile(join(directory, "credentials.json"), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    let value: unknown;
    try { value = JSON.parse(data); }
    catch { throw new DesktopInfrastructureError("Saved infrastructure credentials are damaged. Restore the private infrastructure directory from backup; do not regenerate its database encryption key."); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new DesktopInfrastructureError("Saved infrastructure credentials are invalid. Restore the private infrastructure directory from backup.");
    const credentials = value as Record<string, unknown>;
    const keys = ["litellmMasterKey", "litellmSaltKey", "postgresUsername", "postgresPassword", "minioAccessKey", "minioSecretKey", "milvusRootPassword"];
    if (credentials.version !== 1 || keys.some(key => typeof credentials[key] !== "string" || !/^[A-Za-z0-9_-]{20,72}$/.test(credentials[key] as string))) {
        throw new DesktopInfrastructureError("Saved infrastructure credentials are invalid. Restore the private infrastructure directory from backup.");
    }
    return credentials as unknown as InfrastructureCredentials;
}

export async function createInfrastructureCredentials(directory: string): Promise<InfrastructureCredentials> {
    const credentials: InfrastructureCredentials = {
        version: 1,
        litellmMasterKey: `sk-${randomBytes(32).toString("hex")}`,
        litellmSaltKey: `sk-${randomBytes(32).toString("hex")}`,
        postgresUsername: `detqel_${randomBytes(10).toString("hex")}`,
        postgresPassword: randomBytes(32).toString("hex"),
        minioAccessKey: randomBytes(10).toString("hex"),
        minioSecretKey: randomBytes(20).toString("hex"),
        milvusRootPassword: randomBytes(32).toString("hex"),
    };
    await writeFile(join(directory, "credentials.json"), `${JSON.stringify(credentials, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return credentials;
}

export async function writeInfrastructureConfiguration(directory: string, assetsDirectory: string, credentials: InfrastructureCredentials): Promise<NodeJS.ProcessEnv> {
    if (!isAbsolute(assetsDirectory)) throw new DesktopInfrastructureError("Desktop infrastructure assets require an absolute application resource directory.");
    await copyFile(join(assetsDirectory, "compose.yaml"), join(directory, "compose.yaml"));
    try {
        await copyFile(join(assetsDirectory, "litellm.yaml"), join(directory, "litellm.yaml"), constants.COPYFILE_EXCL);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const milvusTemplate = await readFile(join(assetsDirectory, "milvus.user.yaml.template"), "utf8");
    const milvusConfiguration = milvusTemplate
        .replaceAll("__MILVUS_ROOT_PASSWORD__", credentials.milvusRootPassword)
        .replaceAll("__MINIO_ACCESS_KEY__", credentials.minioAccessKey)
        .replaceAll("__MINIO_SECRET_KEY__", credentials.minioSecretKey);
    // The parent directory is user-only. Container user milvus must be able to read its mounted config.
    await writeFile(join(directory, "milvus.user.yaml"), milvusConfiguration, { mode: 0o644 });
    const variables = {
        LITELLM_MASTER_KEY: credentials.litellmMasterKey,
        LITELLM_SALT_KEY: credentials.litellmSaltKey,
        POSTGRES_USER: credentials.postgresUsername,
        POSTGRES_PASSWORD: credentials.postgresPassword,
        MINIO_ROOT_USER: credentials.minioAccessKey,
        MINIO_ROOT_PASSWORD: credentials.minioSecretKey,
    };
    await writeFile(join(directory, ".env"), `${Object.entries(variables).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, { mode: 0o600 });
    return { ...process.env, ...variables, COMPOSE_ANSI: "never", COMPOSE_PROGRESS: "plain" };
}
