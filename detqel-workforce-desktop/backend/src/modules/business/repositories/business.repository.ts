import type { BusinessGoal, BusinessKnowledge, BusinessMemory, BusinessProfile, BusinessRule, BusinessState, NewBusinessGoal, NewBusinessKnowledge, NewBusinessMemory, NewBusinessProfile, NewBusinessRule, NewBusinessState } from "../../../shared/types/entities.js";
export interface IBusinessRepository {
    getProfile(workspaceId: string): Promise<BusinessProfile | null>;
    upsertProfile(workspaceId: string, data: Partial<NewBusinessProfile> & {
        businessName: string;
    }): Promise<BusinessProfile>;
    listKnowledge(workspaceId: string): Promise<BusinessKnowledge[]>;
    addKnowledge(data: NewBusinessKnowledge): Promise<BusinessKnowledge>;
    deleteKnowledge(id: string): Promise<boolean>;
    listGoals(workspaceId: string): Promise<BusinessGoal[]>;
    createGoal(data: NewBusinessGoal): Promise<BusinessGoal>;
    updateGoal(id: string, data: Partial<NewBusinessGoal>): Promise<BusinessGoal | null>;
    listRules(workspaceId: string): Promise<BusinessRule[]>;
    createRule(data: NewBusinessRule): Promise<BusinessRule>;
    getLatestState(workspaceId: string, stateType?: string): Promise<BusinessState[]>;
    recordState(data: NewBusinessState): Promise<BusinessState>;
    listMemories(workspaceId: string): Promise<BusinessMemory[]>;
    addMemory(data: NewBusinessMemory): Promise<BusinessMemory>;
}
