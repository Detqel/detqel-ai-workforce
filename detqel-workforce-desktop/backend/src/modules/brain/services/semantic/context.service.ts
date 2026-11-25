import { BRAIN_LIMITS } from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { tokens, type BrainActor, type BrainEvidence } from "../brain-types.js";
import type { DatasetService } from "../data/dataset.service.js";
import { metricFormula } from "./metric.service.js";
import type { SemanticQueryService } from "./semantic-query.service.js";

const relevance = (words: Set<string>, text: string) => tokens(text).reduce((score, word) => score + (words.has(word) ? 1 : 0), 0);

/**
 * BuildTaskContext (PRD 6.4, 13): the task-relevant, permission-filtered business context for a question. Identity
 * and policies are resolved first; structured facts come from the semantic layer with provenance and freshness,
 * documents from approved knowledge (marked untrusted), and similarity is only used for ranking, never access.
 */
export class ContextService {
    constructor(private readonly unit: IUnitOfWork, private readonly semantic: SemanticQueryService, private readonly datasets: DatasetService) {}

    async build(actor: BrainActor, question: string) {
        const words = new Set(tokens(question));
        const [profile, metrics, datasets, rules, knowledge, memory] = await Promise.all([
            this.unit.business.getProfile(actor.workspaceId),
            this.semantic.visibleMetrics(actor),
            this.datasets.list(actor),
            this.unit.business.listRules(actor.workspaceId),
            this.unit.business.listKnowledge(actor.workspaceId),
            this.unit.business.listMemories(actor.workspaceId),
        ]);
        const ranked = metrics.map(metric => ({ metric, score: relevance(words, `${metric.key.replace(/_/g, " ")} ${metric.name} ${metric.description ?? ""}`) }))
            .sort((a, b) => b.score - a.score).slice(0, 8);
        const facts = [];
        const evidence: BrainEvidence[] = [];
        for (const { metric } of ranked) {
            try {
                const result = await this.semantic.query(actor, { metricKey: metric.key, periods: 2 });
                const [previous, latest] = result.series.length > 1 ? result.series.slice(-2) : [null, result.series[0] ?? null];
                facts.push({ metric: result.metric.key, name: result.metric.name, definition: metricFormula(metric), unit: result.metric.unit, currency: result.metric.currency, latest, previous, dataset: result.dataset, caveats: result.caveats });
                evidence.push(...result.evidence);
            } catch { /* not queryable by this caller */ }
        }
        const documents = knowledge.filter(item => item.status === "active").map(item => ({ item, score: relevance(words, `${item.title} ${item.content.slice(0, 2_000)}`) }))
            .filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 5)
            .map(({ item }) => ({ id: item.id, title: item.title, excerpt: item.content.slice(0, 400), updatedAt: item.updatedAt, untrusted: true }));
        const context = {
            tenant: { workspaceId: actor.workspaceId, role: actor.role },
            business: profile ? { name: profile.businessName, industry: profile.industry, description: profile.description?.slice(0, 600) ?? null } : null,
            metrics: facts,
            datasets: datasets.map(dataset => ({ name: dataset.name, domain: dataset.domain, zone: dataset.zone, freshness: dataset.freshness, lastSuccessAt: dataset.lastSuccessAt, version: dataset.publishedVersion })),
            rules: rules.filter(rule => rule.status === "active").map(rule => ({ rule, score: relevance(words, `${rule.name} ${rule.description}`) })).sort((a, b) => b.score - a.score).slice(0, 10)
                .map(({ rule }) => ({ name: rule.name, type: rule.ruleType, description: rule.description.slice(0, 300) })),
            documents,
            decisions: memory.filter(item => item.memoryType === "decision").slice(0, 5).map(item => ({ title: item.title, content: item.content.slice(0, 300), at: item.createdAt })),
            evidence,
            generatedAt: new Date().toISOString(),
        };
        // Bounded so it always fits a model's context alongside instructions.
        while (JSON.stringify(context).length > BRAIN_LIMITS.maxContextCharacters && (context.documents.length || context.metrics.length > 3)) {
            if (context.documents.length) context.documents.pop(); else context.metrics.pop();
        }
        return context;
    }
}
