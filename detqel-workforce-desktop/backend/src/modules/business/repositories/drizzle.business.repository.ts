import { and, desc, eq } from "drizzle-orm";
import { type DatabaseSession } from "../../../infrastructure/database/connection.js";
import { businessGoals, businessKnowledge, businessMemory, businessProfile, businessRules, businessState, type BusinessGoal, type BusinessKnowledge, type BusinessMemory, type BusinessProfile, type BusinessRule, type BusinessState, type NewBusinessGoal, type NewBusinessKnowledge, type NewBusinessMemory, type NewBusinessProfile, type NewBusinessRule, type NewBusinessState, } from "../../../infrastructure/database/schema/business.js";
import type { IBusinessRepository } from "./business.repository.js";
export class BusinessRepository implements IBusinessRepository {
    constructor(private readonly database: DatabaseSession) { }
    // Business Profile
    async getProfile(workspaceId: string): Promise<BusinessProfile | null> {
        const [profile] = await this.database
            .select()
            .from(businessProfile)
            .where(eq(businessProfile.workspaceId, workspaceId))
            .limit(1);
        return profile || null;
    }
    async upsertProfile(workspaceId: string, data: Partial<NewBusinessProfile> & {
        businessName: string;
    }): Promise<BusinessProfile> {
        const [profile] = await this.database
            .insert(businessProfile)
            .values({ ...data, workspaceId })
            .onConflictDoUpdate({ target: businessProfile.workspaceId, set: { ...data, workspaceId, updatedAt: new Date() } })
            .returning();
        return profile;
    }
    // Business Knowledge
    async listKnowledge(workspaceId: string): Promise<BusinessKnowledge[]> {
        return this.database
            .select()
            .from(businessKnowledge)
            .where(eq(businessKnowledge.workspaceId, workspaceId))
            .orderBy(desc(businessKnowledge.createdAt));
    }
    async addKnowledge(data: NewBusinessKnowledge): Promise<BusinessKnowledge> {
        const [item] = await this.database
            .insert(businessKnowledge)
            .values(data)
            .returning();
        return item;
    }
    async deleteKnowledge(id: string): Promise<boolean> {
        const result = await this.database
            .delete(businessKnowledge)
            .where(eq(businessKnowledge.id, id))
            .returning();
        return result.length > 0;
    }
    // Business Goals
    async listGoals(workspaceId: string): Promise<BusinessGoal[]> {
        return this.database
            .select()
            .from(businessGoals)
            .where(eq(businessGoals.workspaceId, workspaceId))
            .orderBy(desc(businessGoals.createdAt));
    }
    async createGoal(data: NewBusinessGoal): Promise<BusinessGoal> {
        const [goal] = await this.database.insert(businessGoals).values(data).returning();
        return goal;
    }
    async updateGoal(id: string, data: Partial<NewBusinessGoal>): Promise<BusinessGoal | null> {
        const [goal] = await this.database
            .update(businessGoals)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(businessGoals.id, id))
            .returning();
        return goal || null;
    }
    // Business Rules
    async listRules(workspaceId: string): Promise<BusinessRule[]> {
        return this.database
            .select()
            .from(businessRules)
            .where(eq(businessRules.workspaceId, workspaceId))
            .orderBy(desc(businessRules.createdAt));
    }
    async createRule(data: NewBusinessRule): Promise<BusinessRule> {
        const [rule] = await this.database.insert(businessRules).values(data).returning();
        return rule;
    }
    // Business State
    async getLatestState(workspaceId: string, stateType?: string): Promise<BusinessState[]> {
        const conditions = [eq(businessState.workspaceId, workspaceId)];
        if (stateType)
            conditions.push(eq(businessState.stateType, stateType));
        return this.database
            .select()
            .from(businessState)
            .where(and(...conditions))
            .orderBy(desc(businessState.generatedAt));
    }
    async recordState(data: NewBusinessState): Promise<BusinessState> {
        const [state] = await this.database
            .insert(businessState)
            .values(data)
            .returning();
        return state;
    }
    // Business Memory
    async listMemories(workspaceId: string): Promise<BusinessMemory[]> {
        return this.database
            .select()
            .from(businessMemory)
            .where(eq(businessMemory.workspaceId, workspaceId))
            .orderBy(desc(businessMemory.createdAt));
    }
    async addMemory(data: NewBusinessMemory): Promise<BusinessMemory> {
        const [memory] = await this.database
            .insert(businessMemory)
            .values(data)
            .returning();
        return memory;
    }
}
