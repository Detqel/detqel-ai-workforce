import type { FastifyReply, FastifyRequest } from "fastify";
import type { LookupService } from "../services/lookup.service.js";
import { createLookupSchema, lookupItemParamsSchema, lookupParamsSchema, updateLookupSchema } from "../validation/lookup.schemas.js";

export class LookupController {
    constructor(private readonly service: LookupService) {}

    async list(request: FastifyRequest, reply: FastifyReply) {
        const { resource } = lookupParamsSchema.parse(request.params);
        return reply.send(await this.service.list(resource));
    }
    async getById(request: FastifyRequest, reply: FastifyReply) {
        const { resource, id } = lookupItemParamsSchema.parse(request.params);
        return reply.send(await this.service.getById(resource, id));
    }
    async create(request: FastifyRequest, reply: FastifyReply) {
        const { resource } = lookupParamsSchema.parse(request.params);
        return reply.status(201).send(await this.service.create(resource, createLookupSchema.parse(request.body)));
    }
    async update(request: FastifyRequest, reply: FastifyReply) {
        const { resource, id } = lookupItemParamsSchema.parse(request.params);
        return reply.send(await this.service.update(resource, id, updateLookupSchema.parse(request.body)));
    }
    async delete(request: FastifyRequest, reply: FastifyReply) {
        const { resource, id } = lookupItemParamsSchema.parse(request.params);
        return reply.send(await this.service.delete(resource, id));
    }
}
