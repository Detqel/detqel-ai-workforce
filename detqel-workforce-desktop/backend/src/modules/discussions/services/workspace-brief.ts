import { AGENT_CONTEXT_CACHE } from "../../../constants/agentContextConstants.js";
import { redactText, truncate, untrusted } from "../../../shared/agents/context/data-guard.js";
import type { IBusinessRepository } from "../../business/repositories/business.repository.js";

const ACTIVE = "active";

function field(label: string, value: unknown): string | null {
    if (value === null || value === undefined || value === "") return null;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return `${label}: ${text}`;
}

/**
 * CAG: the workspace's business profile, active goals, rules and short knowledge notes, as one stable block for
 * the cacheable prompt prefix. It changes only when the business details change, so providers that cache prompts
 * serve it from cache on later turns. A workspace without business details gets no block.
 */
export async function workspaceBrief(business: IBusinessRepository | undefined, workspaceId: string): Promise<string> {
    if (!business) return "";
    try {
        const [profile, goals, rules, knowledge] = await Promise.all([
            business.getProfile(workspaceId),
            business.listGoals(workspaceId),
            business.listRules(workspaceId),
            business.listKnowledge(workspaceId),
        ]);
        const lines: string[] = [];
        if (profile) {
            lines.push(...[
                field("Business", profile.businessName),
                field("Type", profile.businessType),
                field("Industry", profile.industry),
                field("Description", profile.description),
                field("Products and services", profile.productsServices),
                field("Customers", profile.customers),
                field("Departments", profile.departments),
                field("Locations", profile.locations),
                field("Business model", profile.businessModel),
            ].filter((line): line is string => line !== null));
        }
        const activeGoals = goals.filter(goal => goal.status === ACTIVE);
        if (activeGoals.length) lines.push("Goals:", ...activeGoals.map(goal => `- ${goal.title}${goal.description ? `: ${goal.description}` : ""}`));
        const activeRules = rules.filter(rule => rule.status === ACTIVE);
        if (activeRules.length) lines.push("Rules to follow:", ...activeRules.map(rule => `- ${rule.name}${rule.description ? `: ${rule.description}` : ""}`));
        const notes = knowledge.filter(item => item.status === ACTIVE);
        if (notes.length) lines.push("Business knowledge:", ...notes.map(item => `- ${item.title}: ${item.content}`));
        if (!lines.length) return "";
        const body = truncate(redactText(lines.join("\n")), AGENT_CONTEXT_CACHE.maxBusinessCharacters).text;
        return `## About this business\n${untrusted("business profile", body)}`;
    } catch {
        // Business details improve answers but are not required for one.
        return "";
    }
}
