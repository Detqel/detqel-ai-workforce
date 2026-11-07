import { AppError } from "../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../shared/logging/logger.js";
import type { IWorkforceRepository } from "../../workforce/repositories/workforce.repository.js";
import type { PomlLoader } from "../../../shared/agents/poml/loader.js";
import { buildAgentPoml } from "../../../shared/agents/poml/poml-builder.js";
import type { DiscussionParticipant, TeamContext } from "../../../shared/agents/graphs/discussion-runtime.js";
import type { RecruitedOrganizationAgent, TeamMemberWithAgent } from "../../../shared/types/graphs.js";
import { DISCUSSION_ERRORS } from "../../../constants/discussionConstants.js";

const logger = createScopedLogger("discussion-participants");

type RecruitedAgent = RecruitedOrganizationAgent | TeamMemberWithAgent["agent"];

/** Who takes part in a session: one agent, or a team with its lead and members. */
export type SessionParticipants =
    | { readonly kind: "solo"; readonly agent: DiscussionParticipant }
    | { readonly kind: "team"; readonly team: TeamContext; readonly lead: DiscussionParticipant };

/**
 * Resolves the recruited agents taking part in a discussion and makes sure each one has a current POML persona,
 * keyed by its recruited-agent id. The persona is built from the agent's saved name, role, template, and
 * instructions, and is rewritten whenever those change, so every agent speaks from POML that matches what the
 * user configured.
 */
export class DiscussionParticipants {
    constructor(private readonly workforce: IWorkforceRepository, private readonly poml: PomlLoader) {}

    /** The one agent of a one-to-one discussion. Fails when the agent is not in the workspace. */
    async soloAgent(workspaceId: string, agentId: string): Promise<DiscussionParticipant> {
        const agent = (await this.workforce.listRecruitedOrganizationAgents(workspaceId)).find(candidate => candidate.id === agentId);
        if (!agent) throw new AppError(403, DISCUSSION_ERRORS.agentUnavailable);
        return this.participant(agent, false);
    }

    /** The team of a team discussion, with its lead. The lead is the member flagged lead, else the first member. */
    async team(workspaceId: string, teamId: string): Promise<{ team: TeamContext; lead: DiscussionParticipant }> {
        const team = await this.workforce.getTeamById(teamId, workspaceId);
        if (!team) throw new AppError(403, DISCUSSION_ERRORS.teamUnavailable);
        if (team.members.length === 0) throw new AppError(409, DISCUSSION_ERRORS.teamWithoutMembers);
        const leadMemberId = (team.members.find(member => member.isLead) ?? team.members[0]).agentId;
        const members: DiscussionParticipant[] = [];
        for (const member of team.members) {
            const participant = await this.participant(member.agent, member.agentId === leadMemberId, member.memberRole);
            members.push(participant);
        }
        const lead = members.find(member => member.isLead);
        if (!lead) throw new AppError(409, DISCUSSION_ERRORS.teamWithoutMembers);
        return { team: { name: team.name, purpose: team.missionObjective ?? team.description ?? null, members }, lead };
    }

    /**
     * The agent's own role comes first: the lead routes work by it, and it is what the user sees on each reply.
     * The team member role only stands in for an agent saved without one, since it is a generic column default
     * for most members.
     */
    private async participant(agent: RecruitedAgent, isLead: boolean, teamRole?: string): Promise<DiscussionParticipant> {
        const name = agent.customName?.trim() || agent.template?.name?.trim() || "Agent";
        const role = agent.customRole?.trim() || agent.template?.role?.trim() || teamRole?.trim() || "Specialist";
        await this.ensurePersona(agent, name, role);
        return { agentId: agent.id, name, role, promptRef: agent.id, isLead };
    }

    /**
     * Keeps the persona in step with the agent's saved fields: written when missing, rewritten when the fields
     * (or how personas are built) changed, and left alone otherwise so a turn does no file write.
     */
    private async ensurePersona(agent: RecruitedAgent, name: string, role: string): Promise<void> {
        const section = agent.template?.section?.name;
        const source = buildAgentPoml({
            role: `You are ${name}, the ${role}${section ? ` in the ${section} department` : ""}.`,
            purpose: agent.template?.summary,
            context: agent.template?.description,
            instructions: agent.customInstructions || agent.systemPrompt,
        });
        if ((await this.poml.readUserAgentPrompt(agent.id)) === source) return;
        await this.poml.writeUserAgentPrompt(agent.id, source);
        logger.info({ agentId: agent.id }, "Wrote POML persona for a recruited agent from its saved fields");
    }
}
