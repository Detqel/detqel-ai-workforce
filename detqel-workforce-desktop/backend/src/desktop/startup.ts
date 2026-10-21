import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";

export interface DesktopStartupStep {
    id: string;
    label: string;
    status: "pending" | "running" | "complete" | "error";
    detail: string | null;
}

export const DESKTOP_STARTUP_STEPS = [
    { id: "docker", label: "Container runtime" },
    { id: "litellm-database", label: "LiteLLM database" },
    { id: "milvus", label: "Milvus vector store" },
    { id: "litellm", label: "LiteLLM gateway" },
    { id: "application-database", label: "Application database" },
    { id: "backend-api", label: "Workspace API" },
] as const;

export function emitStartupStep(step: DesktopStartupStep): void {
    process.stdout.write(`${JSON.stringify({ type: "startup", step })}\n`);
}

export async function listenOnPrivatePort(app: FastifyInstance): Promise<string> {
    // Bind the actual server directly; never release a temporary socket before claiming its port.
    const ports = new Set<number>();
    while (ports.size < 100) {
        const port = randomInt(50_000, 60_000);
        if (ports.has(port)) continue;
        ports.add(port);
        try {
            return await app.listen({ host: "127.0.0.1", port });
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "EADDRINUSE" && code !== "EACCES") throw error;
        }
    }
    throw new Error("No available private application port in the configured 50000–59999 range");
}
