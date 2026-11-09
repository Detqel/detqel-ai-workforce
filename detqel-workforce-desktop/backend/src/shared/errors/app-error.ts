export class AppError extends Error {
    /**
     * `expose` shows the message to the caller even for a 5xx status. Use it only for messages written for end
     * users, such as an unreachable dependency; other server errors are replaced with a generic message.
     */
    constructor(public readonly statusCode: number, message: string, public readonly details?: Record<string, unknown>, public readonly expose = false) {
        super(message);
        this.name = statusCode >= 500 ? "Internal Server Error" : "Request Error";
    }
}
