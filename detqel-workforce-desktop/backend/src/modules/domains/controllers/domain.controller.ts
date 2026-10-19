import type { FastifyReply, FastifyRequest } from "fastify";
import type { DomainService } from "../services/domain.service.js";
import { createDomainSchema } from "../validation/domain.schemas.js";
export class DomainController {
    constructor(private readonly service: DomainService) { }
    async listAll(_request: FastifyRequest, reply: FastifyReply) {
        const domains = await this.service.listAllDomains();
        return reply.send(domains);
    }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const body = createDomainSchema.parse(request.body);
        const domain = await this.service.createDomain(body);
        return reply.status(201).send(domain);
    }
}
