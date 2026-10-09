import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService } from "../services/auth.service.js";
import { loginSchema, registerSchema } from "../validation/auth.schemas.js";
export class AuthController {
    constructor(private readonly service: AuthService) { }
    async checkUser(request: FastifyRequest, reply: FastifyReply) {
        const { email, username } = z.object({ email: z.string().email().optional(), username: z.string().min(1).optional() }).parse(request.query);
        return reply.send(await this.service.checkUser(email, username));
    }
    async login(request: FastifyRequest, reply: FastifyReply) {
        const body = loginSchema.parse(request.body);
        return reply.send(await this.service.login(body.identifier, body.password));
    }
    async register(request: FastifyRequest, reply: FastifyReply) {
        const response = await this.service.register(registerSchema.parse(request.body));
        return reply.status(response.isExistingUser ? 200 : 201).send(response);
    }
    async me(request: FastifyRequest, reply: FastifyReply) {
        const { userId } = z.object({ userId: z.string().uuid().optional() }).parse(request.query);
        return reply.send(await this.service.me(userId));
    }
}
