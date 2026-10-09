import { type IndustryDomain } from "../../../shared/types/entities.js";
import type { IDomainRepository } from "../repositories/domain.repository.js";
export interface CreateDomainDTO {
    name: string;
    description?: string;
    isCustom?: boolean;
}
export class DomainService {
    constructor(private readonly repository: IDomainRepository) { }
    /**
     * List all domains from the database
     */
    async listAllDomains(): Promise<IndustryDomain[]> {
        return this.repository.listAllDomains();
    }
    /**
     * Create or ensure a domain exists in the database
     */
    async createDomain(dto: CreateDomainDTO): Promise<IndustryDomain> {
        return this.repository.ensureDomain(dto.name, dto.isCustom ?? true);
    }
}
