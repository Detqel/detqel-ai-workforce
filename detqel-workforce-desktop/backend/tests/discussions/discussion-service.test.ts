import test, { beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextTick } from "node:timers/promises";
import { DiscussionService, type PreparedTurn } from "../../src/modules/discussions/services/discussion.service.js";
import type { DiscussionParticipants } from "../../src/modules/discussions/services/discussion-participants.js";
import type { IUnitOfWork } from "../../src/shared/contracts/unit-of-work.js";
import type { DiscussionParticipant, DiscussionRuntime, TriageResult, TurnContext } from "../../src/shared/agents/graphs/discussion-runtime.js";
import type { TurnStreamEvent } from "../../src/shared/agents/graphs/discussion-turn.graph.js";
import type { FileServer } from "../../src/shared/rag/file-server.js";
import type { RagService } from "../../src/shared/rag/rag.service.js";
import type { IAgentModelProvisioner } from "../../src/shared/agents/agent-model.provisioner.js";
import type { IWorkspaceWebSearch } from "../../src/shared/agents/tools/workspace-web-search.js";
import type { DiscussionActivityStep } from "../../src/shared/types/discussion-activity.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { DocumentExporter } from "../../src/shared/documents/document-exporter.js";
import {
    DISCUSSION_ACTIVITY_KINDS,
    DISCUSSION_CAPABILITY_MODES,
    DISCUSSION_INTENTS,
    DISCUSSION_MEMORY,
    DISCUSSION_RESPONSE_MODES,
    DISCUSSION_SPEAKER_ROLES,
    DISCUSSION_STREAM_EVENTS,
} from "../../src/constants/discussionConstants.js";
import { FILE_SERVER_SCOPES } from "../../src/constants/fileServerConstants.js";

const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-2222-2222-222222222222";
const USER = "33333333-3333-3333-3333-333333333333";
const USAGE = { inputTokens: 100, outputTokens: 20, cachedTokens: 50, costUsd: 0.01 };

const solo: DiscussionParticipant = { agentId: "agent-solo", name: "Vyra", role: "Advisor", promptRef: "agent-solo", isLead: false };
const lead: DiscussionParticipant = { agentId: "agent-lead", name: "Nabspy", role: "Lead", promptRef: "agent-lead", isLead: true };
const ana: DiscussionParticipant = { agentId: "agent-ana", name: "Ana", role: "Analyst", promptRef: "agent-ana", isLead: false };
const raj: DiscussionParticipant = { agentId: "agent-raj", name: "Raj", role: "Engineer", promptRef: "agent-raj", isLead: false };

/** An in-memory unit-of-work exposing only the repositories DiscussionService touches. */
function fakeUnit() {
    let sessionSeq = 0;
    let messageSeq = 0;
    const sessions = new Map<string, any>();
    const messages = new Map<string, any[]>();
    const attached = new Map<string, Set<string>>();
    const connections = new Map<string, { id: string; workspaceId: string }>();

    const discussions = {
        async createSession(s: any) {
            const id = `session-${++sessionSeq}`;
            const row = { id, summary: null, summarizedMessageCount: 0, pendingTurn: null, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, ...s };
            sessions.set(id, row); messages.set(id, []); attached.set(id, new Set()); return { ...row };
        },
        async listSessions(ws: string) { return [...sessions.values()].filter(x => x.workspaceId === ws); },
        async findSessionInWorkspace(id: string, ws: string) { const row = sessions.get(id); return row && row.workspaceId === ws ? { ...row } : null; },
        async deleteSession(id: string) { messages.delete(id); attached.delete(id); return sessions.delete(id); },
        async renameSession(id: string, title: string) { const row = sessions.get(id); if (!row) return null; row.title = title; return { ...row }; },
        async listMessages(id: string) { return [...(messages.get(id) ?? [])]; },
        async appendMessage(m: any) { const row = { id: `msg-${++messageSeq}`, createdAt: new Date(), speakerName: null, ...m }; messages.get(m.sessionId)!.push(row); return row; },
        async appendMessageWithSources(input: any) { const row = { id: `msg-${++messageSeq}`, createdAt: new Date(), ...input.message }; messages.get(input.message.sessionId)!.push(row); return row; },
        async setPendingTurn(id: string, pending: any) { const row = sessions.get(id); if (row) row.pendingTurn = pending; },
        async addUsage(id: string, usage: typeof USAGE) {
            const row = sessions.get(id);
            row.inputTokens += usage.inputTokens; row.outputTokens += usage.outputTokens; row.cachedTokens += usage.cachedTokens; row.costUsd += usage.costUsd;
            return { ...row };
        },
        async updateMemory(id: string, summary: string, count: number) { Object.assign(sessions.get(id), { summary, summarizedMessageCount: count }); },
        async listAttachedConnections(id: string) { return [...(attached.get(id) ?? [])].map(connectionId => ({ connectionId })); },
        async attachConnection(id: string, connectionId: string) { attached.get(id)!.add(connectionId); return { sessionId: id, connectionId }; },
        async detachConnection(id: string, connectionId: string) { return attached.get(id)!.delete(connectionId); },
    };
    const connectionsRepo = {
        async findInWorkspace(id: string, ws: string) { const c = connections.get(id); return c && c.workspaceId === ws ? c : null; },
    };
    const unit = { discussions, connections: connectionsRepo } as unknown as IUnitOfWork;
    return { unit, connections, sessions, messages };
}

function fakeParticipants(members: DiscussionParticipant[] = [lead, ana, raj]) {
    const roster = { members };
    const participants = {
        async soloAgent(ws: string, id: string) {
            if (ws !== WORKSPACE || id !== solo.agentId) throw new AppError(403, "The selected agent is not available in this workspace.");
            return solo;
        },
        async team(ws: string, id: string) {
            if (ws !== WORKSPACE || id !== "team-1") throw new AppError(403, "The selected team is not available in this workspace.");
            return { team: { name: "DETQEL Core", purpose: null, members: roster.members }, lead: roster.members.find(member => member.isLead)! };
        },
    } as unknown as DiscussionParticipants;
    return { participants, roster };
}

type Step = "triage" | "write" | "draft" | "review";

/**
 * A runtime whose triage verdict is scripted per call and which records every context it ran. Written replies
 * stream in two pieces. `hold` makes the next write wait until released, to stop a turn while it is writing.
 */
type Verdict = Omit<TriageResult, "usage" | "document"> & { document?: TriageResult["document"] };
function fakeRuntime(triageFor: (context: TurnContext) => Verdict = () => ({ intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [] })) {
    const calls: Array<{ step: Step; context: TurnContext }> = [];
    const summaries: Array<{ count: number }> = [];
    let failWrite: Error | null = null;
    let held: { started: () => void; release: Promise<void> } | null = null;
    const streamed = async (context: TurnContext, onText: (text: string) => void, signal?: AbortSignal) => {
        const content = `${context.participant.name} answers.`;
        onText(content.slice(0, 5));
        if (held) {
            const current = held;
            held = null;
            current.started();
            await Promise.race([current.release, new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }))]);
        }
        onText(content.slice(5));
        return { content, usage: USAGE };
    };
    const runtime = {
        async triage(context: TurnContext) { calls.push({ step: "triage", context }); return { document: null, ...triageFor(context), usage: USAGE }; },
        async searchKnowledge(context: TurnContext) {
            const chunks = context.collaborators.retrieveKnowledge ? await context.collaborators.retrieveKnowledge("q") : [];
            return { blocks: chunks.map(chunk => chunk.text), sources: chunks.map(chunk => ({ type: "knowledge", title: chunk.source, reference: chunk.source })) };
        },
        async searchWeb(context: TurnContext) {
            const results = context.webEnabled && context.collaborators.searchWeb ? await context.collaborators.searchWeb("q") : [];
            return { blocks: results.map(result => result.snippet), sources: results.map(result => ({ type: "web", title: result.title, reference: result.url, url: result.url })) };
        },
        searchQuery(context: TurnContext) { return context.message; },
        grounding(blocks: string[]) { return `GROUNDING(${blocks.length})`; },
        async write(context: TurnContext, onText: (text: string) => void, signal?: AbortSignal) {
            calls.push({ step: "write", context });
            if (failWrite) throw failWrite;
            return streamed(context, onText, signal);
        },
        async draft(context: TurnContext) { calls.push({ step: "draft", context }); return { content: "draft", usage: USAGE }; },
        async review(context: TurnContext, _grounding: string, _draft: string, onText: (text: string) => void, signal?: AbortSignal) {
            calls.push({ step: "review", context });
            return streamed(context, onText, signal);
        },
        async summarize(_ws: string, _previous: string | null, folded: unknown[]) { summaries.push({ count: folded.length }); return { summary: "Summary.", usage: USAGE }; },
    } as unknown as DiscussionRuntime;
    return {
        runtime,
        calls,
        summaries,
        failNextWrite(error: Error) { failWrite = error; },
        /** The next streamed reply pauses after its first piece; resolves once it has. */
        hold() {
            let started = () => {};
            let release = () => {};
            const startedPromise = new Promise<void>(resolve => { started = resolve; });
            held = { started, release: new Promise<void>(resolve => { release = resolve; }) };
            return { started: startedPromise, release };
        },
    };
}

/** Web search for a workspace that has (or has not) saved a Tavily key. */
function fakeWebSearch(configured = true) {
    const searches: Array<{ workspaceId: string; query: string }> = [];
    let checks = 0;
    const webSearch: IWorkspaceWebSearch = {
        async assertConfigured() {
            checks++;
            if (!configured) throw new AppError(409, "Web search is not configured. Add a Tavily API key in Settings before using web search.");
        },
        async search(workspaceId: string, query: string) {
            searches.push({ workspaceId, query });
            return [{ title: "News", url: "https://news.test/a", snippet: "s" }];
        },
    };
    return { webSearch, searches, get checks() { return checks; } };
}

function readyModels(): IAgentModelProvisioner & { ensured: string[] } {
    const ensured: string[] = [];
    return { ensured, async ensure(workspaceId: string) { ensured.push(workspaceId); } };
}

function spyRag(chunks: Array<{ text: string; source: string }> = []) {
    const deleted: string[] = [];
    const rag = { async deleteSession(id: string) { deleted.push(id); }, async retrieve() { return chunks; }, async ingestDocument() { return 1; } } as unknown as RagService;
    return { rag, deleted };
}

/** A file server that keeps each session's artifacts in memory. */
function spyFileServer() {
    const deleted: string[] = [];
    const artifacts = new Map<string, Map<string, { contents: Buffer; mimeType: string }>>();
    const folder = (loc: { sessionId: string }) => {
        if (!artifacts.has(loc.sessionId)) artifacts.set(loc.sessionId, new Map());
        return artifacts.get(loc.sessionId)!;
    };
    const fs = {
        async ensureSession() { return "/tmp/x"; },
        async deleteSession(loc: { sessionId: string }) { deleted.push(loc.sessionId); },
        async storeKnowledgeFile() { return { name: "n", path: "/tmp/n", size: 1 }; },
        async storeArtifact(loc: { sessionId: string }, name: string, mimeType: string, contents: Buffer) {
            folder(loc).set(name, { contents, mimeType });
            return { name, path: `/tmp/${name}`, size: contents.byteLength };
        },
        async hasArtifact(loc: { sessionId: string }, name: string) { return folder(loc).has(name); },
        async listArtifacts(loc: { sessionId: string }) {
            return [...folder(loc)].map(([name, file]) => ({ name, path: `/tmp/${name}`, size: file.contents.byteLength, modifiedAt: new Date() }));
        },
        async readArtifact(loc: { sessionId: string }, name: string) {
            const file = folder(loc).get(name);
            if (!file) throw new AppError(404, "The requested file was not found in the session store.");
            return file.contents;
        },
        async deleteArtifact(loc: { sessionId: string }, name: string) { return folder(loc).delete(name); },
    } as unknown as FileServer;
    return { fs, deleted, artifacts };
}

const turn = (sessionId: string, message: string) => ({
    workspaceId: WORKSPACE, sessionId, message,
    responseMode: DISCUSSION_RESPONSE_MODES.brief, capabilityMode: DISCUSSION_CAPABILITY_MODES.fast, webEnabled: false,
});

/** Runs a prepared turn to the end and returns every streamed event. */
async function collect(prepared: PreparedTurn, signal = new AbortController().signal): Promise<TurnStreamEvent[]> {
    const events: TurnStreamEvent[] = [];
    await prepared.run(event => events.push(event), signal);
    return events;
}

const ofType = (events: TurnStreamEvent[], type: string) => events.filter(event => event.type === type);
const replies = (events: TurnStreamEvent[]) => ofType(events, DISCUSSION_STREAM_EVENTS.reply).map(event => event.message as any);
const speakers = (events: TurnStreamEvent[]) => ofType(events, DISCUSSION_STREAM_EVENTS.speaker).map(event => event.name);
const kinds = (steps: ReadonlyArray<DiscussionActivityStep>) => steps.map(step => step.kind);

describe("DiscussionService", () => {
    let fixture: ReturnType<typeof fakeUnit>;
    beforeEach(() => { fixture = fakeUnit(); });

    function build(options: { runtime?: DiscussionRuntime; models?: IAgentModelProvisioner; members?: DiscussionParticipant[]; rag?: RagService; fs?: FileServer; webSearch?: IWorkspaceWebSearch } = {}) {
        const { participants, roster } = fakeParticipants(options.members);
        const service = new DiscussionService(fixture.unit, options.runtime ?? fakeRuntime().runtime, options.fs ?? spyFileServer().fs, options.rag ?? spyRag().rag, options.models ?? readyModels(), participants, options.webSearch ?? fakeWebSearch().webSearch, new DocumentExporter());
        return { service, roster };
    }

    describe("sessions", () => {
        test("a session needs exactly one target, and its scope and title follow that target", async () => {
            const { service } = build();
            await assert.rejects(() => service.createSession({ workspaceId: WORKSPACE, createdBy: USER }), /needs an agent or a team/);
            await assert.rejects(() => service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, teamId: "team-1", createdBy: USER }), /not both/);
            const agentSession = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            assert.equal(agentSession.scope, FILE_SERVER_SCOPES.conversations);
            assert.equal(agentSession.title, "Vyra");
            const teamSession = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            assert.equal(teamSession.scope, FILE_SERVER_SCOPES.teams);
            assert.equal(teamSession.title, "DETQEL Core");
        });

        test("an agent or team from another workspace cannot be the target", async () => {
            const { service } = build();
            await assert.rejects(() => service.createSession({ workspaceId: OTHER_WORKSPACE, agentId: solo.agentId, createdBy: USER }), /not available/);
            await assert.rejects(() => service.createSession({ workspaceId: OTHER_WORKSPACE, teamId: "team-1", createdBy: USER }), /not available/);
        });

        test("listing and reading sessions is scoped to the workspace", async () => {
            const { service } = build();
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            assert.equal((await service.listSessions(WORKSPACE)).length, 1);
            assert.equal((await service.listSessions(OTHER_WORKSPACE)).length, 0);
            await assert.rejects(() => service.getSession(OTHER_WORKSPACE, session.id), /not found/);
        });

        test("deleting a session cleans up the vector collection and the file-server folder", async () => {
            const rag = spyRag();
            const fs = spyFileServer();
            const { service } = build({ rag: rag.rag, fs: fs.fs });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await service.deleteSession(WORKSPACE, session.id);
            assert.deepEqual(rag.deleted, [session.id]);
            assert.deepEqual(fs.deleted, [session.id]);
        });

        test("connectors attach only from the session's workspace", async () => {
            fixture.connections.set("conn-foreign", { id: "conn-foreign", workspaceId: OTHER_WORKSPACE });
            fixture.connections.set("conn-ok", { id: "conn-ok", workspaceId: WORKSPACE });
            const { service } = build();
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await assert.rejects(() => service.attachConnector(WORKSPACE, session.id, "conn-foreign"), /does not belong to this workspace/);
            await service.attachConnector(WORKSPACE, session.id, "conn-ok");
            assert.deepEqual(await service.listAttachedConnectors(WORKSPACE, session.id), ["conn-ok"]);
        });
    });

    describe("one-to-one turns", () => {
        test("a greeting is answered by triage alone, streamed, and saved with its activity", async () => {
            const fake = fakeRuntime(() => ({ intent: DISCUSSION_INTENTS.conversational, reply: "Hello!", handoffs: [] }));
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const events = await collect(await service.startMessage(turn(session.id, "hey")));
            assert.deepEqual(fake.calls.map(call => call.step), ["triage"]);
            assert.deepEqual(events.map(event => event.type), ["turn", "speaker", "activity", "activity", "token", "reply", "pending", "done"]);
            const [saved] = replies(events);
            assert.equal(saved.content, "Hello!");
            assert.equal(saved.speakerName, "Vyra");
            assert.equal(saved.turnId, (events[0].userMessage as any).turnId);
            assert.deepEqual(kinds(saved.activity), [DISCUSSION_ACTIVITY_KINDS.understanding]);
            assert.equal(saved.activity[0].detail.conversational, true);
            assert.deepEqual(events.at(-1)!.usage, USAGE);
            assert.equal(fixture.sessions.get(session.id).pendingTurn, null);
        });

        test("a task streams the reply as it is written and adds up usage across calls", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const events = await collect(await service.startMessage(turn(session.id, "Draft a plan")));
            assert.deepEqual(fake.calls.map(call => call.step), ["triage", "write"]);
            assert.equal(fake.calls[0].context.speakerRole, DISCUSSION_SPEAKER_ROLES.solo);
            assert.deepEqual(ofType(events, "token").map(event => event.text), ["Vyra ", "answers."]);
            const [saved] = replies(events);
            assert.equal(saved.inputTokens, 200, "the message records the usage of both calls");
            assert.deepEqual(kinds(saved.activity), [DISCUSSION_ACTIVITY_KINDS.understanding, DISCUSSION_ACTIVITY_KINDS.writing]);
            assert.ok(saved.activity.every((step: DiscussionActivityStep) => step.status === "done" && typeof step.durationMs === "number"));
        });

        test("each step is reported as running and then done, with the same id", async () => {
            const { service } = build();
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const steps = ofType(await collect(await service.startMessage(turn(session.id, "Plan"))), "activity").map(event => event.step as DiscussionActivityStep);
            assert.deepEqual(steps.map(step => `${step.kind}:${step.status}`), ["understanding:running", "understanding:done", "writing:running", "writing:done"]);
            assert.equal(steps[0].id, steps[1].id);
        });

        test("each reply sees the conversation so far, including the message it answers", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await collect(await service.startMessage(turn(session.id, "first")));
            await collect(await service.startMessage(turn(session.id, "second")));
            const context = fake.calls.at(-1)!.context;
            assert.deepEqual(context.transcript.map(message => message.content), ["first", "Vyra answers.", "second"]);
            assert.equal(context.message, "second");
        });

        test("an empty message is rejected", async () => {
            const { service } = build();
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await assert.rejects(() => service.startMessage(turn(session.id, "   ")), /message is required/);
        });

        test("when models cannot be provisioned the message is not saved and the reason reaches the user", async () => {
            const failing: IAgentModelProvisioner = { async ensure() { throw new AppError(409, "No AI model is configured."); } };
            const { service } = build({ models: failing });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await assert.rejects(() => service.startMessage(turn(session.id, "Hello")), /No AI model is configured/);
            assert.equal((await service.listMessages(WORKSPACE, session.id)).length, 0);
        });

        test("a failure mid-turn reports the failed step and ends the turn instead of leaving it to retry", async () => {
            const fake = fakeRuntime();
            fake.failNextWrite(new AppError(502, "The local AI gateway could not complete the model request."));
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const events: TurnStreamEvent[] = [];
            const prepared = await service.startMessage(turn(session.id, "Plan"));
            await assert.rejects(() => prepared.run(event => events.push(event), new AbortController().signal), /could not complete/);
            const failed = ofType(events, "activity").map(event => event.step as DiscussionActivityStep).find(step => step.status === "failed");
            assert.equal(failed?.kind, DISCUSSION_ACTIVITY_KINDS.writing);
            assert.equal(fixture.sessions.get(session.id).pendingTurn, null);
            await assert.rejects(() => service.startContinue(WORKSPACE, session.id), /No teammate is waiting/);
        });
    });

    describe("team turns", () => {
        test("in one stream, the lead answers, hands work to teammates, and they answer their assignments", async () => {
            const fake = fakeRuntime(context => context.speakerRole === DISCUSSION_SPEAKER_ROLES.lead
                ? { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [{ name: "ana", task: "Size the market" }, { name: "Nabspy", task: "self" }, { name: "Ghost", task: "x" }, { name: "Ana", task: "dup" }] }
                : { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [] });
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const events = await collect(await service.startMessage(turn(session.id, "Plan the launch")));

            assert.deepEqual(speakers(events), ["Nabspy", "Ana", "Nabspy"], "unknown names, the lead itself, and duplicates are dropped; the lead closes");
            const [leadReply, anaReply, wrapUp] = replies(events);
            assert.equal(leadReply.isLead, true);
            assert.equal(leadReply.turnRole, DISCUSSION_SPEAKER_ROLES.lead);
            assert.deepEqual(kinds(leadReply.activity), [DISCUSSION_ACTIVITY_KINDS.understanding, DISCUSSION_ACTIVITY_KINDS.coordinating, DISCUSSION_ACTIVITY_KINDS.writing]);
            assert.deepEqual(leadReply.activity[1].detail.names, ["Ana"]);
            assert.deepEqual(fake.calls.find(call => call.step === "write")!.context.handoffs, [{ name: "Ana", task: "Size the market" }]);

            assert.equal(anaReply.turnRole, DISCUSSION_SPEAKER_ROLES.delegate, "a handoff is marked so it can be shown apart");
            assert.deepEqual(kinds(anaReply.activity), [DISCUSSION_ACTIVITY_KINDS.assigned, DISCUSSION_ACTIVITY_KINDS.writing]);
            assert.deepEqual(anaReply.activity[0].detail, { leadName: "Nabspy", task: "Size the market" });
            const delegate = fake.calls.find(call => call.context.speakerRole === DISCUSSION_SPEAKER_ROLES.delegate)!;
            assert.equal(delegate.step, "write", "a delegate answers without triage");
            assert.deepEqual(delegate.context.assignment, { leadName: "Nabspy", task: "Size the market" });
            assert.ok(delegate.context.transcript.some(message => message.speakerName === "Nabspy"), "the delegate sees the lead's reply");

            assert.equal(wrapUp.turnRole, DISCUSSION_SPEAKER_ROLES.wrapUp);
            assert.deepEqual(kinds(wrapUp.activity), [DISCUSSION_ACTIVITY_KINDS.consolidating]);
            assert.deepEqual(wrapUp.activity[0].detail, { names: ["Ana"] });

            assert.deepEqual(ofType(events, "pending").map(event => (event.speakers as any[]).map(speaker => speaker.name)), [["Ana", "Nabspy"], ["Nabspy"], []]);
            assert.equal(fixture.sessions.get(session.id).pendingTurn, null);
            await assert.rejects(() => service.startContinue(WORKSPACE, session.id), /No teammate is waiting/);
        });

        test("the lead's wrap-up writes from its teammates' replies, without triaging or searching again", async () => {
            const fake = fakeRuntime(context => context.speakerRole === DISCUSSION_SPEAKER_ROLES.lead
                ? { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [{ name: "Ana", task: "Size it" }, { name: "Raj", task: "Build it" }] }
                : { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [] });
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            await collect(await service.startMessage({ ...turn(session.id, "Plan the launch"), capabilityMode: DISCUSSION_CAPABILITY_MODES.expert }));
            const wrapUp = fake.calls.filter(call => call.context.speakerRole === DISCUSSION_SPEAKER_ROLES.wrapUp);
            assert.deepEqual(wrapUp.map(call => call.step), ["write"], "even in expert mode the wrap-up is one write");
            assert.deepEqual(wrapUp[0].context.contributors, ["Ana", "Raj"]);
            assert.deepEqual(wrapUp[0].context.transcript.filter(message => message.role === "assistant").map(message => message.speakerName), ["Nabspy", "Ana", "Raj"]);
        });

        test("a lead that answers alone does not wrap up", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const events = await collect(await service.startMessage(turn(session.id, "Status?")));
            assert.deepEqual(speakers(events), ["Nabspy"]);
        });

        test("teammates the user names do not get a wrap-up", async () => {
            const { service } = build();
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const events = await collect(await service.startMessage(turn(session.id, "Ana and Raj, thoughts?")));
            assert.deepEqual(speakers(events), ["Ana", "Raj"]);
        });

        test("leaving before the wrap-up keeps it due, and continuing delivers it", async () => {
            const fake = fakeRuntime(context => context.speakerRole === DISCUSSION_SPEAKER_ROLES.lead
                ? { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [{ name: "Ana", task: "Size it" }] }
                : { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [] });
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const leaving = new AbortController();
            await (await service.startMessage(turn(session.id, "Plan it"))).run(event => {
                if (event.type === "reply" && (event.message as any).speakerName === "Ana") leaving.abort();
            }, leaving.signal);
            assert.deepEqual(fixture.sessions.get(session.id).pendingTurn.queue, [{ agentId: lead.agentId, assignment: null, wrapUp: true }]);
            const resumed = await collect(await service.startContinue(WORKSPACE, session.id));
            assert.deepEqual(speakers(resumed), ["Nabspy"]);
            assert.equal(replies(resumed)[0].turnRole, DISCUSSION_SPEAKER_ROLES.wrapUp);
        });

        test("a greeting to the team is answered by the lead in one call", async () => {
            const fake = fakeRuntime(() => ({ intent: DISCUSSION_INTENTS.conversational, reply: "Hi, I lead this team.", handoffs: [] }));
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const events = await collect(await service.startMessage(turn(session.id, "Hi")));
            assert.equal(fake.calls.length, 1);
            assert.deepEqual(speakers(events), ["Nabspy"]);
        });

        test("teammates the user names answer directly, in the order named, each triaging first", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const events = await collect(await service.startMessage(turn(session.id, "Raj and Ana, what do you think?")));
            assert.deepEqual(speakers(events), ["Raj", "Ana"]);
            assert.deepEqual(fake.calls.map(call => `${call.step}:${call.context.participant.name}:${call.context.speakerRole}`),
                ["triage:Raj:addressed", "write:Raj:addressed", "triage:Ana:addressed", "write:Ana:addressed"]);
        });

        test("naming only the lead is an ordinary lead turn", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            await collect(await service.startMessage(turn(session.id, "Nabspy, status?")));
            assert.equal(fake.calls[0].context.speakerRole, DISCUSSION_SPEAKER_ROLES.lead);
        });

        test("leaving mid-turn keeps what was said and who is still due, and continuing picks up from there", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const leaving = new AbortController();
            const prepared = await service.startMessage(turn(session.id, "Raj and Ana, review this"));
            // Raj, named first, is held mid-reply when the user leaves.
            const hold = fake.hold();
            const events: TurnStreamEvent[] = [];
            const running = prepared.run(event => events.push(event), leaving.signal);
            await hold.started;
            leaving.abort();
            await running;
            assert.deepEqual(speakers(events), ["Raj"], "Raj was held, so nobody else spoke");
            assert.deepEqual(replies(events), [], "a reply cut off mid-stream is not saved");
            assert.deepEqual(fixture.sessions.get(session.id).pendingTurn.queue.map((entry: any) => entry.agentId), [raj.agentId, ana.agentId]);

            const resumed = await collect(await service.startContinue(WORKSPACE, session.id));
            assert.deepEqual(speakers(resumed), ["Raj", "Ana"]);
            assert.equal(replies(resumed).length, 2);
            assert.equal(fixture.sessions.get(session.id).pendingTurn, null);
        });

        test("a lead resumed after leaving mid-turn can still hand work to teammates", async () => {
            const fake = fakeRuntime(context => context.speakerRole === DISCUSSION_SPEAKER_ROLES.lead
                ? { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [{ name: "Ana", task: "Size it" }] }
                : { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [] });
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const leaving = new AbortController();
            const hold = fake.hold();
            const running = (await service.startMessage(turn(session.id, "Plan it"))).run(() => {}, leaving.signal);
            await hold.started;
            leaving.abort();
            await running;
            const resumed = await collect(await service.startContinue(WORKSPACE, session.id));
            assert.deepEqual(speakers(resumed), ["Nabspy", "Ana", "Nabspy"]);
        });

        test("a new message stops the turn still running and its remaining speakers", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const hold = fake.hold();
            const firstEvents: TurnStreamEvent[] = [];
            const first = (await service.startMessage(turn(session.id, "Ana and Raj, review this"))).run(event => firstEvents.push(event), new AbortController().signal);
            await hold.started;
            const second = await collect(await service.startMessage(turn(session.id, "Never mind")));
            await first;
            assert.equal(replies(firstEvents).length, 0, "the stopped turn saved nothing it had not finished");
            assert.deepEqual(speakers(second), ["Nabspy"]);
            assert.equal(fixture.sessions.get(session.id).pendingTurn, null);
            const contents = fixture.messages.get(session.id)!.map((message: any) => message.content);
            assert.deepEqual(contents, ["Ana and Raj, review this", "Never mind", "Nabspy answers."]);
        });

        test("a speaker still due who left the team is skipped when the turn continues", async () => {
            const fake = fakeRuntime();
            const { service, roster } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const leaving = new AbortController();
            const hold = fake.hold();
            const running = (await service.startMessage(turn(session.id, "Ana and Raj, review this"))).run(() => {}, leaving.signal);
            await hold.started;
            leaving.abort();
            await running;
            // Ana, named first, was cut off and then removed from the team.
            roster.members = [lead, raj];
            const resumed = await collect(await service.startContinue(WORKSPACE, session.id));
            assert.deepEqual(speakers(resumed), ["Raj"]);
        });

        test("continuing while a turn is already running is refused", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const hold = fake.hold();
            const controller = new AbortController();
            const running = (await service.startMessage(turn(session.id, "Plan"))).run(() => {}, controller.signal);
            await hold.started;
            await assert.rejects(() => service.startContinue(WORKSPACE, session.id), /already replying/);
            controller.abort();
            await running;
        });

        test("usage totals grow with every reply of the turn", async () => {
            const { service } = build();
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const events = await collect(await service.startMessage(turn(session.id, "Ana and Raj, review this")));
            const totals = ofType(events, "reply").map(event => event.usage as typeof USAGE);
            assert.deepEqual(totals.map(total => total.outputTokens), [40, 80]);
            assert.ok(Math.abs((events.at(-1)!.usage as typeof USAGE).costUsd - 0.04) < 1e-9);
        });
    });

    describe("expert turns and web search", () => {
        const expertWeb = (sessionId: string, message: string) => ({ ...turn(sessionId, message), capabilityMode: DISCUSSION_CAPABILITY_MODES.expert, webEnabled: true });

        test("an expert reply searches knowledge and the web, drafts, then streams the reviewed reply with its sources", async () => {
            const web = fakeWebSearch(true);
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime, webSearch: web.webSearch, rag: spyRag([{ text: "Refunds within 30 days.", source: "policy.txt" }]).rag });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const events = await collect(await service.startMessage(expertWeb(session.id, "Latest AI regulation news")));
            assert.deepEqual(fake.calls.map(call => call.step), ["triage", "draft", "review"]);
            const [saved] = replies(events);
            assert.deepEqual(kinds(saved.activity), [
                DISCUSSION_ACTIVITY_KINDS.understanding, DISCUSSION_ACTIVITY_KINDS.searchingKnowledge, DISCUSSION_ACTIVITY_KINDS.searchingWeb,
                DISCUSSION_ACTIVITY_KINDS.drafting, DISCUSSION_ACTIVITY_KINDS.reviewing,
            ]);
            assert.equal(saved.activity[1].detail.count, 1);
            assert.deepEqual(saved.activity[2].detail, { query: "Latest AI regulation news", count: 1 });
            assert.deepEqual((ofType(events, "reply")[0].sources as any[]).map(source => source.reference), ["policy.txt", "https://news.test/a"]);
            assert.deepEqual(web.searches, [{ workspaceId: WORKSPACE, query: "q" }]);
            assert.deepEqual(ofType(events, "token").map(event => event.text).join(""), "Vyra answers.");
        });

        test("without a saved key the turn fails before the message is saved", async () => {
            const { service } = build({ webSearch: fakeWebSearch(false).webSearch });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await assert.rejects(() => service.startMessage(expertWeb(session.id, "Latest news")), /Add a Tavily API key in Settings/);
            assert.equal((await service.listMessages(WORKSPACE, session.id)).length, 0);
        });

        test("fast mode never searches the web or needs a key, even with web on", async () => {
            const web = fakeWebSearch(false);
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime, webSearch: web.webSearch });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await collect(await service.startMessage({ ...turn(session.id, "Hi"), webEnabled: true }));
            assert.equal(fake.calls[0].context.collaborators.searchWeb, undefined);
            assert.equal(web.checks, 0);
        });

        test("continuing a web-enabled turn checks the key again", async () => {
            const web = fakeWebSearch(true);
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime, webSearch: web.webSearch });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const leaving = new AbortController();
            const hold = fake.hold();
            const running = (await service.startMessage(expertWeb(session.id, "Ana and Raj, research this"))).run(() => {}, leaving.signal);
            await hold.started;
            leaving.abort();
            await running;
            await collect(await service.startContinue(WORKSPACE, session.id));
            assert.equal(web.checks, 2);
        });
    });

    describe("documents and artifacts", () => {
        const asksForDocument = (title: string) => (context: TurnContext): Verdict => context.speakerRole === DISCUSSION_SPEAKER_ROLES.lead || context.speakerRole === DISCUSSION_SPEAKER_ROLES.solo
            ? { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [], document: { title } }
            : { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [] };

        test("a requested document is written as the reply and saved in the discussion's artifacts", async () => {
            const fake = fakeRuntime(asksForDocument("AI Market Brief"));
            const files = spyFileServer();
            const { service } = build({ runtime: fake.runtime, fs: files.fs });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const events = await collect(await service.startMessage(turn(session.id, "Write me a brief on the AI market")));
            const write = fake.calls.find(call => call.step === "write")!;
            assert.deepEqual(write.context.document, { title: "AI Market Brief", ownerAgentId: solo.agentId }, "the writer is told its reply is the document");
            const [saved] = replies(events);
            assert.deepEqual(kinds(saved.activity), [DISCUSSION_ACTIVITY_KINDS.understanding, DISCUSSION_ACTIVITY_KINDS.writingDocument, DISCUSSION_ACTIVITY_KINDS.savingDocument]);
            assert.deepEqual(saved.activity[2].detail, { title: "AI Market Brief", fileName: "AI Market Brief.md" });
            assert.equal(files.artifacts.get(session.id)!.get("AI Market Brief.md")!.contents.toString("utf8"), "Vyra answers.\n");
            assert.deepEqual((await service.listArtifacts(WORKSPACE, session.id)).map(file => file.fileName), ["AI Market Brief.md"]);
        });

        test("a document with the same title as an earlier one gets a numbered name", async () => {
            const files = spyFileServer();
            const { service } = build({ runtime: fakeRuntime(asksForDocument("Plan")).runtime, fs: files.fs });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await collect(await service.startMessage(turn(session.id, "Write a plan")));
            await collect(await service.startMessage(turn(session.id, "Write the plan again")));
            assert.deepEqual([...files.artifacts.get(session.id)!.keys()], ["Plan.md", "Plan (2).md"]);
        });

        test("when the lead hands work out, its wrap-up is the document, not its opening", async () => {
            const fake = fakeRuntime(context => context.speakerRole === DISCUSSION_SPEAKER_ROLES.lead
                ? { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [{ name: "Ana", task: "Size it" }], document: { title: "Launch Plan" } }
                : { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [] });
            const files = spyFileServer();
            const { service } = build({ runtime: fake.runtime, fs: files.fs });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const events = await collect(await service.startMessage(turn(session.id, "Write the launch plan")));
            const writes = fake.calls.filter(call => call.step === "write");
            assert.deepEqual(writes.map(call => Boolean(call.context.document)), [false, false, true], "lead opening, delegate, then wrap-up");
            const [opening, , wrapUp] = replies(events);
            assert.ok(!kinds(opening.activity).includes(DISCUSSION_ACTIVITY_KINDS.savingDocument));
            assert.deepEqual(kinds(wrapUp.activity), [DISCUSSION_ACTIVITY_KINDS.writingDocument, DISCUSSION_ACTIVITY_KINDS.savingDocument]);
            assert.deepEqual([...files.artifacts.get(session.id)!.keys()], ["Launch Plan.md"]);
        });

        test("leaving before the document is written keeps it due, and continuing writes it", async () => {
            const fake = fakeRuntime(context => context.speakerRole === DISCUSSION_SPEAKER_ROLES.lead
                ? { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [{ name: "Ana", task: "Size it" }], document: { title: "Launch Plan" } }
                : { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [] });
            const files = spyFileServer();
            const { service } = build({ runtime: fake.runtime, fs: files.fs });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const leaving = new AbortController();
            await (await service.startMessage(turn(session.id, "Write the launch plan"))).run(event => {
                if (event.type === "reply" && (event.message as any).speakerName === "Ana") leaving.abort();
            }, leaving.signal);
            assert.deepEqual(fixture.sessions.get(session.id).pendingTurn.document, { title: "Launch Plan", ownerAgentId: lead.agentId });
            assert.equal(files.artifacts.get(session.id)?.size ?? 0, 0);
            await collect(await service.startContinue(WORKSPACE, session.id));
            assert.deepEqual([...files.artifacts.get(session.id)!.keys()], ["Launch Plan.md"]);
        });

        test("a handoff exports as Markdown, Word, and PDF, each saved in the artifacts", async () => {
            const files = spyFileServer();
            const fake = fakeRuntime(context => context.speakerRole === DISCUSSION_SPEAKER_ROLES.lead
                ? { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [{ name: "Ana", task: "Size it" }] }
                : { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [] });
            const { service } = build({ runtime: fake.runtime, fs: files.fs });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const handoff = replies(await collect(await service.startMessage(turn(session.id, "Plan it")))).find(message => message.turnRole === DISCUSSION_SPEAKER_ROLES.delegate);

            const markdown = await service.exportMessage(WORKSPACE, session.id, handoff.id, "md");
            assert.equal(markdown.fileName, `Ana's handoff - ${handoff.id.slice(0, 8)}.md`);
            assert.match(Buffer.from(markdown.contentBase64, "base64").toString("utf8"), /Ana answers\./);
            const word = await service.exportMessage(WORKSPACE, session.id, handoff.id, "docx");
            assert.equal(Buffer.from(word.contentBase64, "base64").subarray(0, 2).toString("latin1"), "PK");
            assert.equal(word.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
            if (process.platform === "win32") {
                const pdf = await service.exportMessage(WORKSPACE, session.id, handoff.id, "pdf");
                assert.equal(Buffer.from(pdf.contentBase64, "base64").subarray(0, 5).toString("latin1"), "%PDF-");
            }
            assert.ok(files.artifacts.get(session.id)!.has(word.fileName));
            // Exporting again replaces the earlier file rather than piling up copies.
            await service.exportMessage(WORKSPACE, session.id, handoff.id, "md");
            assert.equal([...files.artifacts.get(session.id)!.keys()].filter(name => name.endsWith(".md")).length, 1);
        });

        test("only an agent reply in this discussion can be exported", async () => {
            const { service } = build();
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const events = await collect(await service.startMessage(turn(session.id, "Plan")));
            const userMessage = events[0].userMessage as any;
            await assert.rejects(() => service.exportMessage(WORKSPACE, session.id, userMessage.id, "md"), /reply to export was not found/);
            await assert.rejects(() => service.exportMessage(WORKSPACE, session.id, "msg-missing", "md"), /reply to export was not found/);
            await assert.rejects(() => service.exportMessage(OTHER_WORKSPACE, session.id, replies(events)[0].id, "md"), /not found/);
        });

        test("a Markdown document converts to Word beside it; other files cannot be converted", async () => {
            const files = spyFileServer();
            const { service } = build({ runtime: fakeRuntime(asksForDocument("Brief")).runtime, fs: files.fs });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await collect(await service.startMessage(turn(session.id, "Write a brief")));
            const word = await service.exportArtifact(WORKSPACE, session.id, "Brief.md", "docx");
            assert.equal(word.fileName, "Brief.docx");
            await assert.rejects(() => service.exportArtifact(WORKSPACE, session.id, "Brief.docx", "pdf"), /not supported/);
        });

        test("added files are kept, size-limited, downloadable, and removable", async () => {
            const { service } = build();
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const added = await service.uploadArtifact(WORKSPACE, session.id, "notes.txt", "text/plain", Buffer.from("hello"));
            assert.deepEqual([added.fileName, added.size, added.mimeType], ["notes.txt", 5, "text/plain; charset=utf-8"]);
            const download = await service.downloadArtifact(WORKSPACE, session.id, "notes.txt");
            assert.equal(Buffer.from(download.contentBase64, "base64").toString("utf8"), "hello");
            await assert.rejects(() => service.uploadArtifact(WORKSPACE, session.id, "big.txt", "text/plain", Buffer.alloc(800 * 1024)), /too large/);
            assert.equal(await service.deleteArtifact(WORKSPACE, session.id, "notes.txt"), true);
            assert.deepEqual(await service.listArtifacts(WORKSPACE, session.id), []);
        });

        test("a discussion can be renamed within its workspace", async () => {
            const { service } = build();
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            assert.equal((await service.renameSession(WORKSPACE, session.id, "  Q3 launch planning  ")).title, "Q3 launch planning");
            await assert.rejects(() => service.renameSession(OTHER_WORKSPACE, session.id, "x"), /not found/);
        });
    });

    describe("memory", () => {
        test("older messages are folded into the summary in the background, keeping the most recent ones verbatim", async () => {
            const fake = fakeRuntime(() => ({ intent: DISCUSSION_INTENTS.conversational, reply: "ok", handoffs: [] }));
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const turnsToTrigger = Math.floor(DISCUSSION_MEMORY.triggerAfter / 2) + 1;
            for (let index = 0; index < turnsToTrigger; index++) await collect(await service.startMessage(turn(session.id, `message ${index}`)));
            await nextTick(); await nextTick();

            const total = turnsToTrigger * 2;
            const row = fixture.sessions.get(session.id);
            assert.equal(row.summary, "Summary.");
            assert.equal(row.summarizedMessageCount, total - DISCUSSION_MEMORY.keepRecent);
            assert.deepEqual(fake.summaries, [{ count: total - DISCUSSION_MEMORY.keepRecent }]);
            assert.equal(row.outputTokens, (turnsToTrigger + 1) * USAGE.outputTokens, "the summary call's usage is counted too");

            await collect(await service.startMessage(turn(session.id, "after")));
            const context = fake.calls.at(-1)!.context;
            assert.equal(context.summary, "Summary.");
            assert.equal(context.transcript.length, DISCUSSION_MEMORY.keepRecent + 1, "only messages outside the summary are sent, plus the new message");
        });
    });
});
