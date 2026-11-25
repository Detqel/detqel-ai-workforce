import type { FastifyReply, FastifyRequest } from "fastify";
import type { BrainServices } from "../services/brain-services.js";
import {
    analysisRunsQuery, forecastBody, optimisationBody, recommendationWorkflowBody, rootCauseBody, runParams, scenarioBody, scenarioParams, simulationBody,
} from "../validation/brain.schemas.js";
import { actorOf } from "./brain-actor.js";

/** Intelligence Engine endpoints: governed forecasts, simulations, optimisation, root cause, run registry and scenarios. */
export class BrainIntelligenceController {
    constructor(private readonly brain: BrainServices) {}

    methods = async () => this.brain.intelligence.methods();
    forecast = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.intelligence.forecast(actorOf(request), forecastBody.parse(request.body)));
    simulate = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.intelligence.simulate(actorOf(request), simulationBody.parse(request.body)));
    optimise = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.intelligence.optimise(actorOf(request), optimisationBody.parse(request.body)));
    rootCause = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.intelligence.rootCause(actorOf(request), rootCauseBody.parse(request.body)));
    listRuns = async (request: FastifyRequest) => this.brain.intelligence.listRuns(actorOf(request), analysisRunsQuery.parse(request.query));
    getRun = async (request: FastifyRequest) => this.brain.intelligence.getRun(actorOf(request), runParams.parse(request.params).runId);
    reproduce = async (request: FastifyRequest) => this.brain.intelligence.reproduce(actorOf(request), runParams.parse(request.params).runId);
    recommendationWorkflow = async (request: FastifyRequest, reply: FastifyReply) => {
        const actor = actorOf(request);
        const run = await this.brain.intelligence.getRun(actor, runParams.parse(request.params).runId);
        return reply.status(201).send(await this.brain.workflows.draftFromRecommendation(actor, run, recommendationWorkflowBody.parse(request.body).recommendationIndex));
    };
    listScenarios = async (request: FastifyRequest) => this.brain.intelligence.listScenarios(actorOf(request));
    saveScenario = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.intelligence.saveScenarioFromInput(actorOf(request), scenarioBody.parse(request.body)));
    deleteScenario = async (request: FastifyRequest) => this.brain.intelligence.deleteScenario(actorOf(request), scenarioParams.parse(request.params).scenarioId);
    runScenario = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.intelligence.simulate(actorOf(request), { scenarioId: scenarioParams.parse(request.params).scenarioId }));
}
