import type { FastifyReply, FastifyRequest } from "fastify";
import { requireUserId } from "../../../shared/security/request-context.js";
import type { AuthService } from "../services/auth.service.js";
import { loginSchema, registerSchema } from "../validation/auth.schemas.js";
export class AuthController {
    constructor(private readonly service: AuthService) { }
    async login(request: FastifyRequest, reply: FastifyReply) {
        const body = loginSchema.parse(request.body);
        return reply.send(await this.service.login(body.username, body.password));
    }
    async licenseOptions(_request: FastifyRequest, reply: FastifyReply) {
        return reply.send(await this.service.licenseOptions());
    }
    async register(request: FastifyRequest, reply: FastifyReply) {
        // 202: the account exists, but its license waits for a DETQEL administrator's approval.
        return reply.status(202).send(await this.service.register(registerSchema.parse(request.body)));
    }
    async me(request: FastifyRequest, reply: FastifyReply) {
        return reply.send(await this.service.me(requireUserId(request)));
    }
}
