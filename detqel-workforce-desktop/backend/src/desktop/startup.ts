import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
    DESKTOP_IPC,
    DESKTOP_RETRYABLE_PORT_ERRORS,
    DESKTOP_STARTUP_SETTINGS,
    type DesktopStartupStatus,
} from "../constants/desktopConstants.js";
import { LOOPBACK_HOST, PRIVATE_PORT_RANGE } from "../constants/networkConstants.js";

export { DESKTOP_STARTUP_STEPS } from "../constants/desktopConstants.js";

export interface DesktopStartupStep {
    id: string;
    label: string;
    status: DesktopStartupStatus;
    detail: string | null;
}

export function emitStartupStep(step: DesktopStartupStep): void {
    process.stdout.write(`${JSON.stringify({ type: DESKTOP_IPC.startupEventType, step })}\n`);
}

export async function listenOnPrivatePort(app: FastifyInstance): Promise<string> {
    // Bind the actual server directly; never release a temporary socket before claiming its port.
    const ports = new Set<number>();
    while (ports.size < DESKTOP_STARTUP_SETTINGS.apiPortAllocationAttempts) {
        const port = randomInt(PRIVATE_PORT_RANGE.minimum, PRIVATE_PORT_RANGE.maximum + 1);
        if (ports.has(port)) continue;
        ports.add(port);
        try {
            return await app.listen({ host: LOOPBACK_HOST, port });
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === undefined || !DESKTOP_RETRYABLE_PORT_ERRORS.includes(code)) throw error;
        }
    }
    throw new Error(`No available private application port in the configured ${PRIVATE_PORT_RANGE.minimum}–${PRIVATE_PORT_RANGE.maximum} range`);
}
