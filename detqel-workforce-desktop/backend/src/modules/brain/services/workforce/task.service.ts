import { BRAIN_ERRORS, BRAIN_LIMITS } from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import { roleAllows } from "../../../workspaces/services/workspace-access.service.js";
import type { BrainActor } from "../brain-types.js";
import { BRAIN_AGENTS, BRAIN_SKILLS } from "./agent-catalog.js";
import type { ToolGateway } from "./tool-gateway.js";

/** Task plans and execution steps for inspection (FR-AGT-009), and the versioned agent, skill and tool catalogue. */
export class BrainTaskService {
    constructor(private readonly unit: IUnitOfWork, private readonly gateway: ToolGateway) {}

    /** Members see their own tasks; managers and above see the workspace's. */
    list(actor: BrainActor, limit?: number) {
        return this.unit.brainWorkforce.listTasks(actor.workspaceId, { initiatedBy: roleAllows(actor.role, "write") ? undefined : actor.userId ?? undefined, limit: Math.min(limit ?? 25, BRAIN_LIMITS.listLimit) });
    }

    async get(actor: BrainActor, id: string) {
        const task = await this.unit.brainWorkforce.findTask(id, actor.workspaceId);
        if (!task || (!roleAllows(actor.role, "write") && task.initiatedBy !== actor.userId)) throw new AppError(404, BRAIN_ERRORS.taskNotFound);
        return { task, steps: await this.unit.brainWorkforce.listSteps(task.id) };
    }

    catalog() {
        return {
            agents: BRAIN_AGENTS.map(agent => ({ ...agent })),
            skills: BRAIN_SKILLS.map(skill => ({ ...skill })),
            tools: this.gateway.catalog().map(tool => ({ key: tool.key, version: tool.version, description: tool.description, riskTier: tool.riskTier, access: tool.access, external: tool.external, example: tool.example })),
        };
    }

    /** Per-workspace model usage of the assistant, for cost governance (NFR-010). */
    async usage(actor: BrainActor) {
        const tasks = await this.unit.brainWorkforce.listTasks(actor.workspaceId, { limit: BRAIN_LIMITS.listLimit });
        const totals = tasks.reduce((sum, task) => {
            const usage = task.usage as Record<string, number>;
            return { inputTokens: sum.inputTokens + (usage.inputTokens ?? 0), outputTokens: sum.outputTokens + (usage.outputTokens ?? 0), costUsd: sum.costUsd + (usage.costUsd ?? 0) };
        }, { inputTokens: 0, outputTokens: 0, costUsd: 0 });
        return { tasks: tasks.length, ...totals, window: tasks.length ? { from: tasks[tasks.length - 1].createdAt, to: tasks[0].createdAt } : null };
    }
}
