import { Writable } from "node:stream";
import pino, { type Logger, type LoggerOptions } from "pino";

export interface LogPayload {
    level?: number;
    time?: number | string;
    pid?: number;
    hostname?: string;
    msg?: string;
    context?: string;
    point?: string;
    service?: string;
    module?: string;
    err?: Error | { message?: string; stack?: string };
    error?: Error | { message?: string; stack?: string };
    req?: unknown;
    reqId?: string;
    requestId?: string;
    res?: unknown;
    responseTime?: number;
    [key: string]: unknown;
}

const IGNORED_EXTRA_KEYS = new Set([
    "level",
    "time",
    "pid",
    "hostname",
    "msg",
    "context",
    "point",
    "service",
    "module",
    "err",
    "error",
    "v",
    "reqId",
    "requestId",
    "req",
    "res",
    "responseTime",
]);

export function formatTimestamp(date: Date = new Date()): string {
    const pad = (n: number, len = 2) => String(n).padStart(len, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    const millis = pad(date.getMilliseconds(), 3);
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
}

export function formatLogLine(raw: string): string {
    let log: LogPayload;
    try {
        log = JSON.parse(raw);
    } catch {
        return `[${formatTimestamp()}] [Server] ${raw}`;
    }

    const logDate = log.time ? new Date(log.time) : new Date();
    const timestamp = formatTimestamp(isNaN(logDate.getTime()) ? new Date() : logDate);
    const context = log.context || log.point || log.service || log.module || (log.req || log.reqId || log.requestId ? "HTTP" : "Server");

    let message = log.msg || "";
    const errorObj = log.err || log.error;
    if (errorObj) {
        const errMessage = typeof errorObj === "string" ? errorObj : errorObj.message || "";
        if (!message) {
            message = errMessage;
        } else if (errMessage && !message.includes(errMessage)) {
            message = `${message} - ${errMessage}`;
        }
    }

    const extras = Object.keys(log).filter((key) => !IGNORED_EXTRA_KEYS.has(key));
    if (extras.length > 0) {
        const extraStr = extras
            .map((k) => `${k}: ${typeof log[k] === "object" ? JSON.stringify(log[k]) : log[k]}`)
            .join(", ");
        message = message ? `${message} (${extraStr})` : extraStr;
    }

    let line = `[${timestamp}] [${context}] ${message}`;
    if (errorObj && typeof errorObj === "object" && errorObj.stack) {
        line += `\n${errorObj.stack}`;
    }
    return line;
}

export function createLogStream(destination: NodeJS.WritableStream = process.env.DETQEL_DESKTOP ? process.stderr : process.stdout): Writable {
    let buffer = "";

    return new Writable({
        write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                destination.write(`${formatLogLine(trimmed)}\n`);
            }
            callback();
        },
        final(callback: (error?: Error | null) => void) {
            const trimmed = buffer.trim();
            if (trimmed) {
                destination.write(`${formatLogLine(trimmed)}\n`);
            }
            callback();
        },
    });
}

export const appLogger: Logger = pino(
    {
        level: process.env.NODE_ENV === "development" ? "info" : "warn",
    },
    createLogStream()
);

export function createScopedLogger(context: string, options?: LoggerOptions): Logger {
    return appLogger.child({ context, ...options });
}
