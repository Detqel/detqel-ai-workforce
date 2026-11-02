import { and, asc, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import { BaseRepository } from "../../../infrastructure/database/repositories/base.repository.js";
import {
    agentConnections,
    agentMemory,
    agents,
    type Agent,
    type AgentConnection,
    type AgentMemory,
    type NewAgent,
    type NewAgentConnection,
    type NewAgentMemory,
} from "../../../infrastructure/database/schema/workforce.js";
import {
    agentLevels,
    agentSections,
    agentStatuses,
    agentTemplates,
    agentTemplateVersions,
    organizationAgents,
    organizations,
    type AgentSection,
    type OrganizationAgent,
} from "../../../infrastructure/database/schema/recruit.js";
import {
    agentTeams,
    agentTeamMembers,
    type AgentTeam,
    type AgentTeamMember,
} from "../../../infrastructure/database/schema/teams.js";
import type {
    CreateCustomAgentPayload,
    CreateTeamPayload,
    IWorkforceRepository,
    MarketplaceFilterOptions,
    RecruitAgentPayload,
    UpdateTeamPayload,
} from "./workforce.repository.js";
import type {
    AgentTeamWithMembers,
    AgentTemplateWithDetails,
    RecruitedOrganizationAgent,
    TeamMemberWithAgent,
} from "../../../shared/types/graphs.js";

export class WorkforceRepository extends BaseRepository<typeof agents, Agent, NewAgent> implements IWorkforceRepository {
    constructor(database: DatabaseSession) {
        super(agents, database);
    }

    async listAgentsForWorkspace(workspaceId: string): Promise<Agent[]> {
        return this.database
            .select()
            .from(agents)
            .where(or(eq(agents.workspaceId, workspaceId), isNull(agents.workspaceId), eq(agents.agentType, "platform")))
            .orderBy(desc(agents.createdAt));
    }

    async getAgentWithDetails(agentId: string) {
        return this.database.query.agents.findFirst({
            where: eq(agents.id, agentId),
            with: {
                connections: {
                    with: {
                        connection: { columns: { credentialReference: false } },
                    },
                },
                memories: {
                    limit: 20,
                },
            },
        });
    }

    async attachConnection(data: NewAgentConnection): Promise<AgentConnection> {
        const [conn] = await this.database
            .insert(agentConnections)
            .values(data)
            .returning();
        return conn;
    }

    async addMemory(data: NewAgentMemory): Promise<AgentMemory> {
        const [mem] = await this.database
            .insert(agentMemory)
            .values(data)
            .returning();
        return mem;
    }

    async listMemories(agentId: string): Promise<AgentMemory[]> {
        return this.database
            .select()
            .from(agentMemory)
            .where(eq(agentMemory.agentId, agentId))
            .orderBy(desc(agentMemory.createdAt));
    }

    async listMarketplaceSections(): Promise<(AgentSection & { templateCount: number })[]> {
        const rows = await this.database
            .select({
                id: agentSections.id,
                name: agentSections.name,
                slug: agentSections.slug,
                description: agentSections.description,
                icon: agentSections.icon,
                displayOrder: agentSections.displayOrder,
                isActive: agentSections.isActive,
                createdAt: agentSections.createdAt,
                updatedAt: agentSections.updatedAt,
                templateCount: sql<number>`count(${agentTemplates.id})::int`,
            })
            .from(agentSections)
            .leftJoin(
                agentTemplates,
                and(
                    eq(agentTemplates.sectionId, agentSections.id),
                    eq(agentTemplates.isUserCreated, false),
                ),
            )
            .where(eq(agentSections.isActive, true))
            .groupBy(agentSections.id)
            .orderBy(asc(agentSections.displayOrder));

        return rows;
    }

    async listMarketplaceTemplates(options: MarketplaceFilterOptions = {}): Promise<AgentTemplateWithDetails[]> {
        const filters: SQL<unknown>[] = [
            eq(agentTemplates.isUserCreated, false),
        ];

        if (options.sectionSlug && options.sectionSlug !== "all") {
            filters.push(eq(agentSections.slug, options.sectionSlug));
        }

        if (options.levelCode && options.levelCode !== "all") {
            filters.push(eq(agentLevels.code, options.levelCode));
        }

        if (options.search?.trim()) {
            const query = `%${options.search.trim()}%`;
            const searchClause = or(
                ilike(agentTemplates.name, query),
                ilike(agentTemplates.role, query),
                ilike(agentTemplates.description, query),
                ilike(agentTemplates.summary, query),
            );
            if (searchClause) {
                filters.push(searchClause);
            }
        }

        const query = this.database
            .select({
                template: agentTemplates,
                section: agentSections,
                level: agentLevels,
                latestVersion: agentTemplateVersions,
            })
            .from(agentTemplates)
            .innerJoin(agentSections, eq(agentTemplates.sectionId, agentSections.id))
            .innerJoin(agentLevels, eq(agentTemplates.levelId, agentLevels.id))
            .leftJoin(
                agentTemplateVersions,
                and(
                    eq(agentTemplateVersions.templateId, agentTemplates.id),
                    eq(agentTemplateVersions.isLatest, true),
                ),
            )
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(asc(agentSections.displayOrder), asc(agentTemplates.name));

        if (options.limit) {
            query.limit(options.limit);
        }
        if (options.offset) {
            query.offset(options.offset);
        }

        const results = await query;
        return results.map(r => ({
            ...r.template,
            section: r.section,
            level: r.level,
            latestVersion: r.latestVersion,
        }));
    }

    async getMarketplaceTemplate(identifier: string): Promise<AgentTemplateWithDetails | undefined> {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        const condition = isUuid ? eq(agentTemplates.id, identifier) : eq(agentTemplates.slug, identifier);

        const [row] = await this.database
            .select({
                template: agentTemplates,
                section: agentSections,
                level: agentLevels,
                latestVersion: agentTemplateVersions,
            })
            .from(agentTemplates)
            .innerJoin(agentSections, eq(agentTemplates.sectionId, agentSections.id))
            .innerJoin(agentLevels, eq(agentTemplates.levelId, agentLevels.id))
            .leftJoin(
                agentTemplateVersions,
                and(
                    eq(agentTemplateVersions.templateId, agentTemplates.id),
                    eq(agentTemplateVersions.isLatest, true),
                ),
            )
            .where(condition)
            .limit(1);

        if (!row) return undefined;
        return {
            ...row.template,
            section: row.section,
            level: row.level,
            latestVersion: row.latestVersion,
        };
    }

    async recruitTemplate(data: RecruitAgentPayload): Promise<OrganizationAgent> {
        let [org] = await this.database.select().from(organizations).limit(1);
        if (!org) {
            [org] = await this.database
                .insert(organizations)
                .values({
                    id: "00000000-0000-0000-0000-000000000001",
                    name: "Default Organization",
                    slug: "default",
                })
                .onConflictDoNothing()
                .returning();
            if (!org) {
                [org] = await this.database.select().from(organizations).limit(1);
            }
        }

        const template = await this.getMarketplaceTemplate(data.templateId);
        if (!template) {
            throw new Error(`Agent template not found: ${data.templateId}`);
        }

        const customName = data.customName?.trim() || template.name;
        const customRole = data.customRole?.trim() || template.role;
        const customInstructions = data.customInstructions?.trim() || template.latestVersion?.instructionTemplate || template.description || "";
        const systemPrompt = template.latestVersion?.systemPrompt || template.summary || "";
        const configuration = template.latestVersion?.configurationSchema || {};

        const [recruited] = await this.database
            .insert(organizationAgents)
            .values({
                organizationId: org.id,
                workspaceId: data.workspaceId,
                templateId: template.id,
                templateVersionId: template.latestVersion?.id,
                customName,
                customRole,
                systemPrompt,
                customInstructions,
                configuration,
                status: "idle",
                recruitedBy: data.userId,
            })
            .returning();

        // Also register into workforce `agents` table so the rest of the workspace runtime can execute tasks
        const existingAgents = await this.database
            .select()
            .from(agents)
            .where(and(eq(agents.workspaceId, data.workspaceId), eq(agents.name, customName)))
            .limit(1);

        if (existingAgents.length === 0) {
            const configRecord = configuration as Record<string, unknown>;
            const capabilities = Array.isArray(configRecord.capabilities) ? configRecord.capabilities : [template.role];
            await this.database.insert(agents).values({
                workspaceId: data.workspaceId,
                name: customName,
                description: template.description || template.summary || customRole,
                purpose: template.summary || customRole,
                instructions: customInstructions,
                agentType: "marketplace",
                capabilities,
                scope: { section: template.section?.slug || "general", level: template.level?.code || "specialist" },
                status: "active",
                createdBy: data.userId,
            });
        }

        return recruited;
    }

    async createCustomAgent(data: CreateCustomAgentPayload): Promise<RecruitedOrganizationAgent> {
        let [org] = await this.database.select().from(organizations).limit(1);
        if (!org) {
            [org] = await this.database
                .insert(organizations)
                .values({
                    id: "00000000-0000-0000-0000-000000000001",
                    name: "Default Organization",
                    slug: "default",
                })
                .onConflictDoNothing()
                .returning();
            if (!org) {
                [org] = await this.database.select().from(organizations).limit(1);
            }
        }

        const [section] = await this.database
            .select()
            .from(agentSections)
            .where(eq(agentSections.id, data.sectionId))
            .limit(1);

        if (!section) {
            throw new Error(`Agent department / section not found: ${data.sectionId}`);
        }

        let levelId = data.levelId;
        if (!levelId) {
            const [defaultLevel] = await this.database
                .select()
                .from(agentLevels)
                .where(eq(agentLevels.code, "specialist"))
                .limit(1);
            levelId = defaultLevel?.id;
            if (!levelId) {
                const [firstLevel] = await this.database.select().from(agentLevels).limit(1);
                levelId = firstLevel?.id;
            }
        }

        if (!levelId) {
            throw new Error("No agent level defined in database.");
        }

        const [publishedStatus] = await this.database
            .select()
            .from(agentStatuses)
            .where(eq(agentStatuses.code, "published"))
            .limit(1);

        let statusId = publishedStatus?.id;
        if (!statusId) {
            const [firstStatus] = await this.database.select().from(agentStatuses).limit(1);
            statusId = firstStatus?.id;
        }

        if (!statusId) {
            throw new Error("No agent status defined in database.");
        }

        const rawSlug = data.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        const uniqueSlug = `custom-${rawSlug}-${Date.now().toString(36)}`;
        const summary = data.summary?.trim() || data.role.trim();
        const description = data.description?.trim() || summary;
        const systemPrompt = data.systemPrompt?.trim() || summary;
        const capabilities = data.capabilities && data.capabilities.length > 0 ? data.capabilities : [data.role.trim()];

        const [template] = await this.database
            .insert(agentTemplates)
            .values({
                sectionId: section.id,
                name: data.name.trim(),
                role: data.role.trim(),
                slug: uniqueSlug,
                levelId,
                statusId,
                summary,
                description,
                isFeatured: false,
                isUserCreated: true,
                currentVersion: "1.0.0",
            })
            .returning();

        const [version] = await this.database
            .insert(agentTemplateVersions)
            .values({
                templateId: template.id,
                version: "1.0.0",
                systemPrompt,
                instructionTemplate: systemPrompt,
                configurationSchema: { capabilities },
                isLatest: true,
            })
            .returning();

        const [recruited] = await this.database
            .insert(organizationAgents)
            .values({
                organizationId: org.id,
                workspaceId: data.workspaceId,
                templateId: template.id,
                templateVersionId: version.id,
                customName: data.name.trim(),
                customRole: data.role.trim(),
                systemPrompt,
                customInstructions: systemPrompt,
                configuration: { capabilities },
                status: "idle",
                isUserCreated: true,
                recruitedBy: data.userId,
            })
            .returning();

        await this.database.insert(agents).values({
            workspaceId: data.workspaceId,
            name: data.name.trim(),
            description,
            purpose: summary,
            instructions: systemPrompt,
            agentType: "custom",
            capabilities,
            scope: { section: section.slug, isUserCreated: true },
            status: "active",
            createdBy: data.userId,
        });

        return {
            ...recruited,
            template: {
                ...template,
                section,
            },
            teams: [],
        };
    }

    async listRecruitedOrganizationAgents(workspaceId: string): Promise<RecruitedOrganizationAgent[]> {
        const rows = await this.database
            .select({
                orgAgent: organizationAgents,
                template: agentTemplates,
                section: agentSections,
            })
            .from(organizationAgents)
            .leftJoin(agentTemplates, eq(organizationAgents.templateId, agentTemplates.id))
            .leftJoin(agentSections, eq(agentTemplates.sectionId, agentSections.id))
            .where(eq(organizationAgents.workspaceId, workspaceId))
            .orderBy(desc(organizationAgents.recruitedAt));

        // Query team memberships for this workspace
        const teamMemberships = await this.database
            .select({
                member: agentTeamMembers,
                team: agentTeams,
            })
            .from(agentTeamMembers)
            .innerJoin(agentTeams, eq(agentTeamMembers.teamId, agentTeams.id))
            .where(eq(agentTeams.workspaceId, workspaceId));

        const teamMap = new Map<string, { teamId: string; teamName: string; memberRole: string; isLead: boolean; accentColor: string }[]>();
        for (const tm of teamMemberships) {
            const list = teamMap.get(tm.member.agentId) || [];
            list.push({
                teamId: tm.team.id,
                teamName: tm.team.name,
                memberRole: tm.member.memberRole,
                isLead: tm.member.isLead,
                accentColor: tm.team.accentColor,
            });
            teamMap.set(tm.member.agentId, list);
        }

        return rows.map(r => ({
            ...r.orgAgent,
            template: r.template ? { ...r.template, section: r.section } : null,
            teams: teamMap.get(r.orgAgent.id) || [],
        }));
    }

    async listTeams(workspaceId: string): Promise<AgentTeamWithMembers[]> {
        const teams = await this.database
            .select()
            .from(agentTeams)
            .where(eq(agentTeams.workspaceId, workspaceId))
            .orderBy(desc(agentTeams.createdAt));

        if (teams.length === 0) return [];

        const membersRows = await this.database
            .select({
                member: agentTeamMembers,
                agent: organizationAgents,
                template: agentTemplates,
                section: agentSections,
            })
            .from(agentTeamMembers)
            .innerJoin(organizationAgents, eq(agentTeamMembers.agentId, organizationAgents.id))
            .leftJoin(agentTemplates, eq(organizationAgents.templateId, agentTemplates.id))
            .leftJoin(agentSections, eq(agentTemplates.sectionId, agentSections.id))
            .where(sql`${agentTeamMembers.teamId} IN (${sql.join(teams.map(t => sql`${t.id}`), sql`, `)})`);

        const membersByTeam = new Map<string, TeamMemberWithAgent[]>();
        for (const row of membersRows) {
            const list = membersByTeam.get(row.member.teamId) || [];
            list.push({
                ...row.member,
                agent: {
                    ...row.agent,
                    template: row.template ? { ...row.template, section: row.section } : null,
                },
            });
            membersByTeam.set(row.member.teamId, list);
        }

        return teams.map(team => {
            const teamMembers = membersByTeam.get(team.id) || [];
            const lead = teamMembers.find(m => m.isLead) || teamMembers[0] || null;
            return {
                ...team,
                members: teamMembers,
                memberCount: teamMembers.length,
                lead,
            };
        });
    }

    async getTeamById(id: string, workspaceId: string): Promise<AgentTeamWithMembers | undefined> {
        const [team] = await this.database
            .select()
            .from(agentTeams)
            .where(and(eq(agentTeams.id, id), eq(agentTeams.workspaceId, workspaceId)))
            .limit(1);

        if (!team) return undefined;

        const membersRows = await this.database
            .select({
                member: agentTeamMembers,
                agent: organizationAgents,
                template: agentTemplates,
                section: agentSections,
            })
            .from(agentTeamMembers)
            .innerJoin(organizationAgents, eq(agentTeamMembers.agentId, organizationAgents.id))
            .leftJoin(agentTemplates, eq(organizationAgents.templateId, agentTemplates.id))
            .leftJoin(agentSections, eq(agentTemplates.sectionId, agentSections.id))
            .where(eq(agentTeamMembers.teamId, id));

        const members: TeamMemberWithAgent[] = membersRows.map(row => ({
            ...row.member,
            agent: {
                ...row.agent,
                template: row.template ? { ...row.template, section: row.section } : null,
            },
        }));

        const lead = members.find(m => m.isLead) || members[0] || null;

        return {
            ...team,
            members,
            memberCount: members.length,
            lead,
        };
    }

    async createTeam(data: CreateTeamPayload): Promise<AgentTeamWithMembers> {
        if (!data.memberAgentIds || data.memberAgentIds.length < 2) {
            throw new Error("Requires minimum 2 agents in a team to work");
        }

        const [team] = await this.database
            .insert(agentTeams)
            .values({
                workspaceId: data.workspaceId,
                name: data.name.trim(),
                description: data.description?.trim() || null,
                focus: data.focus?.trim() || "Cross-Functional",
                icon: data.icon?.trim() || "Users",
                accentColor: data.accentColor?.trim() || "purple",
                missionObjective: data.missionObjective?.trim() || null,
                createdBy: data.userId || null,
            })
            .returning();

        if (Array.isArray(data.memberAgentIds) && data.memberAgentIds.length > 0) {
            for (const agentId of data.memberAgentIds) {
                const isLead = data.leadAgentId === agentId;
                await this.database
                    .insert(agentTeamMembers)
                    .values({
                        teamId: team.id,
                        agentId,
                        memberRole: isLead ? "Lead" : "Specialist",
                        isLead,
                        assignedBy: data.userId || null,
                    })
                    .onConflictDoNothing();
            }
        }

        return (await this.getTeamById(team.id, data.workspaceId))!;
    }

    async updateTeam(id: string, workspaceId: string, data: UpdateTeamPayload): Promise<AgentTeamWithMembers | undefined> {
        const updateValues: Partial<typeof agentTeams.$inferInsert> = {
            updatedAt: new Date(),
        };
        if (data.name !== undefined) updateValues.name = data.name.trim();
        if (data.description !== undefined) updateValues.description = data.description?.trim() || null;
        if (data.focus !== undefined) updateValues.focus = data.focus.trim();
        if (data.icon !== undefined) updateValues.icon = data.icon.trim();
        if (data.accentColor !== undefined) updateValues.accentColor = data.accentColor.trim();
        if (data.missionObjective !== undefined) updateValues.missionObjective = data.missionObjective?.trim() || null;
        if (data.status !== undefined) updateValues.status = data.status.trim();

        const [updated] = await this.database
            .update(agentTeams)
            .set(updateValues)
            .where(and(eq(agentTeams.id, id), eq(agentTeams.workspaceId, workspaceId)))
            .returning();

        if (!updated) return undefined;
        return this.getTeamById(id, workspaceId);
    }

    async deleteTeam(id: string, workspaceId: string): Promise<boolean> {
        const [deleted] = await this.database
            .delete(agentTeams)
            .where(and(eq(agentTeams.id, id), eq(agentTeams.workspaceId, workspaceId)))
            .returning();
        return Boolean(deleted);
    }

    async addTeamMember(teamId: string, agentId: string, memberRole: string = "Specialist", isLead: boolean = false, assignedBy?: string): Promise<void> {
        if (isLead) {
            await this.database
                .update(agentTeamMembers)
                .set({ isLead: false })
                .where(eq(agentTeamMembers.teamId, teamId));
        }

        await this.database
            .insert(agentTeamMembers)
            .values({
                teamId,
                agentId,
                memberRole,
                isLead,
                assignedBy: assignedBy || null,
            })
            .onConflictDoNothing();
    }

    async removeTeamMember(teamId: string, agentId: string): Promise<void> {
        await this.database
            .delete(agentTeamMembers)
            .where(and(eq(agentTeamMembers.teamId, teamId), eq(agentTeamMembers.agentId, agentId)));
    }
}
