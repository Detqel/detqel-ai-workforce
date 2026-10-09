import type { FastifyReply, FastifyRequest } from "fastify";
import { idParamsSchema } from "../../../shared/validation/http.schemas.js";
import type { UserService } from "../services/user.service.js";
import { createUserSchema } from "../validation/user.schemas.js";
export class UserController {
    constructor(private readonly service: UserService) { }
    async list(request: FastifyRequest, reply: FastifyReply) {
        const list = await this.service.findMany({ limit: 100 });
        return reply.send(list);
    }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createUserSchema.parse(request.body);
        const existing = await this.service.findByEmail(body.email);
        if (existing) {
            return reply.status(409).send({ message: "User with this email already exists" });
        }
        const created = await this.service.create(body);
        return reply.status(201).send(created);
    }
    async getById(request: FastifyRequest, reply: FastifyReply) {
        const { id } = idParamsSchema.parse(request.params);
        const user = await this.service.findWithMemberships(id);
        if (!user) {
            return reply.status(404).send({ message: "User not found" });
        }
        return reply.send(user);
    }
}
