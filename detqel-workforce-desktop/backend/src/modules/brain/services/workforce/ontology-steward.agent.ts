import { z } from "zod";
import type { BrainEntityType, BrainSchemaField } from "../../../../shared/types/entities.js";
import type { AgentMappingProposal, IMappingAdvisor } from "../semantic/ontology.service.js";
import type { IBrainModel } from "./brain-model.js";
import { BRAIN_PROMPT_IDS } from "../../../../constants/brainConstants.js";

const proposalSchema = z.object({
    proposals: z.array(z.object({
        sourceField: z.string().max(255),
        entityTypeKey: z.string().max(80),
        attributeKey: z.string().max(120),
        confidence: z.number(),
        rationale: z.string().max(500),
    }).strict()).max(50),
}).strict();

/**
 * The Ontology Steward agent's model-assisted proposals for fields the deterministic matcher could not place.
 * It sees field names, types and the ontology only, never record values, and its output is filtered to known
 * fields and attributes; the ontology service caps its confidence so every proposal goes to human review.
 */
export class OntologyStewardAdvisor implements IMappingAdvisor {
    constructor(private readonly model: IBrainModel) {}

    async propose(workspaceId: string, fields: ReadonlyArray<BrainSchemaField>, entityTypes: ReadonlyArray<BrainEntityType>, signal?: AbortSignal): Promise<AgentMappingProposal[]> {
        if (!(await this.model.available(workspaceId, signal))) return [];
        const { value } = await this.model.structured({
            workspaceId, promptId: BRAIN_PROMPT_IDS.ontologySteward, schemaName: "mapping_proposals", schema: proposalSchema, purpose: "planning", maxTokens: 2_000, signal,
            input: {
                fields: fields.slice(0, 100).map(field => ({ name: field.name, type: field.type })),
                ontology: entityTypes.slice(0, 50).map(type => ({ key: type.key, name: type.name, description: type.description, attributes: type.attributes.map(attribute => ({ key: attribute.key, name: attribute.name, type: attribute.type })) })),
            },
        });
        return value.proposals;
    }
}
