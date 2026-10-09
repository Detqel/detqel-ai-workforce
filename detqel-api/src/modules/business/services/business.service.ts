import type { BusinessGoal, BusinessKnowledge, BusinessMemory, BusinessProfile, BusinessRule, BusinessState, NewBusinessGoal, NewBusinessKnowledge, NewBusinessMemory, NewBusinessProfile, NewBusinessRule, NewBusinessState } from "../../../shared/types/entities.js";
import type { IBusinessRepository } from "../../business/repositories/business.repository.js";
export class BusinessService {
    constructor(private readonly repository: IBusinessRepository) { }
    getProfile(workspaceId: string): Promise<BusinessProfile | null> { return this.repository.getProfile(workspaceId); }
    upsertProfile(workspaceId: string, data: Partial<NewBusinessProfile> & {
        businessName: string;
    }): Promise<BusinessProfile> { return this.repository.upsertProfile(workspaceId, data); }
    listKnowledge(workspaceId: string): Promise<BusinessKnowledge[]> { return this.repository.listKnowledge(workspaceId); }
    addKnowledge(data: NewBusinessKnowledge): Promise<BusinessKnowledge> { return this.repository.addKnowledge(data); }
    deleteKnowledge(id: string): Promise<boolean> { return this.repository.deleteKnowledge(id); }
    listGoals(workspaceId: string): Promise<BusinessGoal[]> { return this.repository.listGoals(workspaceId); }
    createGoal(data: NewBusinessGoal): Promise<BusinessGoal> { return this.repository.createGoal(data); }
    listRules(workspaceId: string): Promise<BusinessRule[]> { return this.repository.listRules(workspaceId); }
    createRule(data: NewBusinessRule): Promise<BusinessRule> { return this.repository.createRule(data); }
    getLatestState(workspaceId: string, stateType?: string): Promise<BusinessState[]> { return this.repository.getLatestState(workspaceId, stateType); }
    recordState(data: NewBusinessState): Promise<BusinessState> { return this.repository.recordState(data); }
    listMemories(workspaceId: string): Promise<BusinessMemory[]> { return this.repository.listMemories(workspaceId); }
    addMemory(data: NewBusinessMemory): Promise<BusinessMemory> { return this.repository.addMemory(data); }
}
