import { asc, sql } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import { BaseRepository } from "../../../infrastructure/database/repositories/base.repository.js";
import { industryDomains, type IndustryDomain, type NewIndustryDomain, } from "../../../infrastructure/database/schema/domains.js";
import type { IDomainRepository } from "./domain.repository.js";
export class DomainRepository extends BaseRepository<typeof industryDomains, IndustryDomain, NewIndustryDomain> implements IDomainRepository {
    constructor(database: DatabaseSession) {
        super(industryDomains, database);
    }
    /**
     * Find domain by name (case-insensitive)
     */
    async findByName(name: string): Promise<IndustryDomain | null> {
        const trimmed = name.trim();
        const results = await this.database
            .select()
            .from(industryDomains)
            .where(sql `lower(trim(${industryDomains.name})) = lower(${trimmed})`)
            .limit(1);
        return results[0] || null;
    }
    /**
     * Ensure a domain exists in the database.
     * If not found, insert it and return the created record.
     */
    async ensureDomain(name: string, isCustom = false): Promise<IndustryDomain> {
        const trimmed = name.trim();
        if (!trimmed) {
            throw new Error("Domain name cannot be empty");
        }
        const existing = await this.findByName(trimmed);
        if (existing) {
            return existing;
        }
        const [created] = await this.database
            .insert(industryDomains)
            .values({
            name: trimmed,
            isCustom,
        })
            .onConflictDoNothing()
            .returning();
        const domain = created ?? await this.findByName(trimmed);
        if (!domain)
            throw new Error("Could not create or retrieve domain");
        return domain;
    }
    /**
     * List all domains ordered by standard domains first, then alphabetically
     */
    async listAllDomains(): Promise<IndustryDomain[]> {
        return this.database
            .select()
            .from(industryDomains)
            .orderBy(asc(industryDomains.isCustom), asc(industryDomains.name));
    }
}
