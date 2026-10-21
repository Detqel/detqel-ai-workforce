import { spawn } from "node:child_process";
import { DesktopInfrastructureError } from "./infrastructure-error.js";

interface ProcessOptions {
    signal: AbortSignal;
    timeoutMs: number;
    failureMessage: string;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    onActivity?: () => void;
}

const MAX_CAPTURE_BYTES = 512 * 1024;

/** Never return or log stderr: Docker and service diagnostics can contain credentials. */
export function runInfrastructureProcess(command: string, args: string[], options: ProcessOptions): Promise<string> {
    if (options.signal.aborted) return Promise.reject(new DesktopInfrastructureError("Desktop infrastructure startup was cancelled."));
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        let settled = false;
        const finish = (error?: DesktopInfrastructureError) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            options.signal.removeEventListener("abort", cancel);
            if (error) reject(error);
            else resolve(output.trim());
        };
        const cancel = () => {
            child.kill();
            finish(new DesktopInfrastructureError("Desktop infrastructure startup was cancelled."));
        };
        const timer = setTimeout(() => {
            child.kill();
            finish(new DesktopInfrastructureError(`${options.failureMessage} The operation exceeded its startup time limit.`));
        }, options.timeoutMs);
        options.signal.addEventListener("abort", cancel, { once: true });
        if (options.signal.aborted) { cancel(); return; }
        child.stdout.on("data", (chunk: Buffer) => {
            if (output.length < MAX_CAPTURE_BYTES) output += chunk.toString("utf8").slice(0, MAX_CAPTURE_BYTES - output.length);
            options.onActivity?.();
        });
        child.stderr.on("data", () => { options.onActivity?.(); });
        child.once("error", () => finish(new DesktopInfrastructureError(options.failureMessage)));
        child.once("close", code => finish(code === 0 ? undefined : new DesktopInfrastructureError(options.failureMessage)));
    });
}

export function startupDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new DesktopInfrastructureError("Desktop infrastructure startup was cancelled."));
    return new Promise((resolve, reject) => {
        const abort = () => {
            clearTimeout(timer);
            reject(new DesktopInfrastructureError("Desktop infrastructure startup was cancelled."));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
        }, milliseconds);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
    });
}
