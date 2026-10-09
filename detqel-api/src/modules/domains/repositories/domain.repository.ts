import type { IRepository } from "../../../shared/contracts/repository.js";
import type { IndustryDomain, NewIndustryDomain } from "../../../shared/types/entities.js";
export interface IDomainRepository extends IRepository<IndustryDomain, NewIndustryDomain> {
    findByName(name: string): Promise<IndustryDomain | null>;
    ensureDomain(name: string, isCustom?: boolean): Promise<IndustryDomain>;
    listAllDomains(): Promise<IndustryDomain[]>;
}
