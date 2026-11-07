import test, { beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as nextTick } from "node:timers/promises";
import { DiscussionService } from "../../src/modules/discussions/services/discussion.service.js";
import type { DiscussionParticipants } from "../../src/modules/discussions/services/discussion-participants.js";
import type { IUnitOfWork } from "../../src/shared/contracts/unit-of-work.js";
import type { DiscussionParticipant, DiscussionRuntime, TriageResult, TurnContext } from "../../src/shared/agents/graphs/discussion-runtime.js";
import type { FileServer } from "../../src/shared/rag/file-server.js";
import type { RagService } from "../../src/shared/rag/rag.service.js";
import type { IAgentModelProvisioner } from "../../src/shared/agents/agent-model.provisioner.js";
import type { IWorkspaceWebSearch } from "../../src/shared/agents/tools/workspace-web-search.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import {
    DISCUSSION_CAPABILITY_MODES,
    DISCUSSION_INTENTS,
    DISCUSSION_MEMORY,
    DISCUSSION_RESPONSE_MODES,
    DISCUSSION_SPEAKER_ROLES,
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
        async listMessages(id: string) { return [...(messages.get(id) ?? [])]; },
        async appendMessage(m: any) { const row = { id: `msg-${++messageSeq}`, createdAt: new Date(), speakerName: null, ...m }; messages.get(m.sessionId)!.push(row); return row; },
        async appendMessageWithSources(input: any) { const row = { id: `msg-${++messageSeq}`, createdAt: new Date(), ...input.message }; messages.get(input.message.sessionId)!.push(row); return row; },
        async setPendingTurn(id: string, pending: any) { sessions.get(id).pendingTurn = pending; },
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

/** A runtime whose triage verdict is scripted per call and which records every context it ran. */
function fakeRuntime(triageFor: (context: TurnContext) => Omit<TriageResult, "usage"> = () => ({ intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [] })) {
    const calls: Array<{ step: "triage" | "answer"; context: TurnContext }> = [];
    const summaries: Array<{ count: number }> = [];
    const runtime = {
        async triage(context: TurnContext) { calls.push({ step: "triage", context }); return { ...triageFor(context), usage: USAGE }; },
        async answer(context: TurnContext) {
            calls.push({ step: "answer", context });
            return { content: `${context.participant.name} answers.`, sources: [{ type: "knowledge", title: "doc.txt", reference: "doc.txt" }], usage: USAGE };
        },
        async summarize(_ws: string, _previous: string | null, folded: unknown[]) { summaries.push({ count: folded.length }); return { summary: "Summary.", usage: USAGE }; },
    } as unknown as DiscussionRuntime;
    return { runtime, calls, summaries };
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

function spyRag() {
    const deleted: string[] = [];
    const rag = { async deleteSession(id: string) { deleted.push(id); }, async retrieve() { return []; }, async ingestDocument() { return 1; } } as unknown as RagService;
    return { rag, deleted };
}

function spyFileServer() {
    const deleted: string[] = [];
    const fs = { async ensureSession() { return "/tmp/x"; }, async deleteSession(loc: { sessionId: string }) { deleted.push(loc.sessionId); }, async storeKnowledgeFile() { return { name: "n", path: "/tmp/n", size: 1 }; } } as unknown as FileServer;
    return { fs, deleted };
}

const turn = (sessionId: string, message: string) => ({
    workspaceId: WORKSPACE, sessionId, message,
    responseMode: DISCUSSION_RESPONSE_MODES.brief, capabilityMode: DISCUSSION_CAPABILITY_MODES.fast, webEnabled: false,
});

describe("DiscussionService", () => {
    let fixture: ReturnType<typeof fakeUnit>;
    beforeEach(() => { fixture = fakeUnit(); });

    function build(options: { runtime?: DiscussionRuntime; models?: IAgentModelProvisioner; members?: DiscussionParticipant[]; rag?: RagService; fs?: FileServer; webSearch?: IWorkspaceWebSearch } = {}) {
        const { participants, roster } = fakeParticipants(options.members);
        const service = new DiscussionService(fixture.unit, options.runtime ?? fakeRuntime().runtime, options.fs ?? spyFileServer().fs, options.rag ?? spyRag().rag, options.models ?? readyModels(), participants, options.webSearch ?? fakeWebSearch().webSearch);
        return { service, roster };
    }

    describe("web search", () => {
        const expertWeb = (sessionId: string, message: string) => ({ ...turn(sessionId, message), capabilityMode: DISCUSSION_CAPABILITY_MODES.expert, webEnabled: true });

        test("an expert turn with web on searches with the workspace's key and passes the results to the agent", async () => {
            const web = fakeWebSearch(true);
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime, webSearch: web.webSearch });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await service.postMessage(expertWeb(session.id, "Latest AI regulation news"));
            const answer = fake.calls.find(call => call.step === "answer")!;
            assert.equal(answer.context.webEnabled, true);
            const results = await answer.context.collaborators.searchWeb!("query");
            assert.deepEqual(results.map(result => result.url), ["https://news.test/a"]);
            assert.deepEqual(web.searches, [{ workspaceId: WORKSPACE, query: "query" }]);
        });

        test("without a saved key the turn fails before the message is saved", async () => {
            const { service } = build({ webSearch: fakeWebSearch(false).webSearch });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await assert.rejects(() => service.postMessage(expertWeb(session.id, "Latest news")), /Add a Tavily API key in Settings/);
            assert.equal((await service.listMessages(WORKSPACE, session.id)).length, 0);
        });

        test("fast mode never searches the web or needs a key, even with web on", async () => {
            const web = fakeWebSearch(false);
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime, webSearch: web.webSearch });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await service.postMessage({ ...turn(session.id, "Hi"), webEnabled: true });
            assert.equal(fake.calls[0].context.collaborators.searchWeb, undefined);
            assert.equal(web.checks, 0);
        });

        test("a queued teammate in a web-enabled turn is checked for a key too", async () => {
            const web = fakeWebSearch(true);
            const { service } = build({ webSearch: web.webSearch });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            await service.postMessage(expertWeb(session.id, "Ana and Raj, research this"));
            await service.continueTurn(WORKSPACE, session.id);
            assert.equal(web.checks, 2);
        });
    });

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
        test("a greeting is answered by triage alone and the reply carries the agent's name and usage", async () => {
            const fake = fakeRuntime(() => ({ intent: DISCUSSION_INTENTS.conversational, reply: "Hello!", handoffs: [] }));
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const posted = await service.postMessage(turn(session.id, "hey"));
            assert.deepEqual(fake.calls.map(call => call.step), ["triage"]);
            assert.equal(posted.replies[0].message.content, "Hello!");
            assert.equal(posted.replies[0].message.speakerName, "Vyra");
            assert.equal(posted.replies[0].message.turnId, posted.userMessage.turnId);
            assert.deepEqual(posted.pending, []);
            assert.deepEqual(posted.usage, USAGE);
        });

        test("a task runs triage then the answer, and usage adds up on the session", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const posted = await service.postMessage(turn(session.id, "Draft a plan"));
            assert.deepEqual(fake.calls.map(call => call.step), ["triage", "answer"]);
            assert.equal(fake.calls[0].context.speakerRole, DISCUSSION_SPEAKER_ROLES.solo);
            assert.equal(posted.usage.inputTokens, 200);
            assert.equal(posted.replies[0].message.inputTokens, 200, "the message records the usage of both calls");
            assert.equal(posted.replies[0].sources.length, 1);
        });

        test("the transcript carries the conversation so far, not the new message", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await service.postMessage(turn(session.id, "first"));
            await service.postMessage(turn(session.id, "second"));
            const context = fake.calls[fake.calls.length - 1].context;
            assert.deepEqual(context.transcript.map(message => message.content), ["first", "Vyra answers."]);
            assert.equal(context.message, "second");
        });

        test("an empty message is rejected", async () => {
            const { service } = build();
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await assert.rejects(() => service.postMessage(turn(session.id, "   ")), /message is required/);
        });

        test("when models cannot be provisioned the message is not saved and the reason reaches the user", async () => {
            const failing: IAgentModelProvisioner = { async ensure() { throw new AppError(409, "No AI model is configured."); } };
            const { service } = build({ models: failing });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            await assert.rejects(() => service.postMessage(turn(session.id, "Hello")), /No AI model is configured/);
            assert.equal((await service.listMessages(WORKSPACE, session.id)).length, 0);
        });
    });

    describe("team turns", () => {
        test("the lead answers first and queues the teammates it delegated to, who then answer their assignments", async () => {
            const fake = fakeRuntime(context => context.speakerRole === DISCUSSION_SPEAKER_ROLES.lead
                ? { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [{ name: "ana", task: "Size the market" }, { name: "Nabspy", task: "self" }, { name: "Ghost", task: "x" }, { name: "Ana", task: "dup" }] }
                : { intent: DISCUSSION_INTENTS.task, reply: null, handoffs: [] });
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const posted = await service.postMessage(turn(session.id, "Plan the launch"));

            assert.equal(posted.replies[0].message.speakerName, "Nabspy");
            assert.equal(posted.replies[0].message.isLead, true);
            assert.deepEqual(posted.pending.map(speaker => speaker.name), ["Ana"], "unknown names, the lead itself, and duplicates are dropped");
            const leadAnswer = fake.calls.find(call => call.step === "answer")!;
            assert.deepEqual(leadAnswer.context.handoffs, [{ name: "Ana", task: "Size the market" }]);

            const continued = await service.continueTurn(WORKSPACE, session.id);
            assert.equal(continued.reply!.message.speakerName, "Ana");
            const delegate = fake.calls[fake.calls.length - 1];
            assert.equal(delegate.step, "answer", "a delegate answers without triage");
            assert.deepEqual(delegate.context.assignment, { leadName: "Nabspy", task: "Size the market" });
            assert.equal(delegate.context.message, "Plan the launch");
            assert.ok(delegate.context.transcript.some(message => message.speakerName === "Nabspy"), "the delegate sees the lead's reply");
            assert.deepEqual(continued.pending, []);
            assert.equal(fixture.sessions.get(session.id).pendingTurn, null);
            await assert.rejects(() => service.continueTurn(WORKSPACE, session.id), /No teammate is waiting/);
        });

        test("a greeting to the team is answered by the lead in one call with nobody queued", async () => {
            const fake = fakeRuntime(() => ({ intent: DISCUSSION_INTENTS.conversational, reply: "Hi, I lead this team.", handoffs: [] }));
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const posted = await service.postMessage(turn(session.id, "Hi"));
            assert.equal(fake.calls.length, 1);
            assert.equal(posted.replies[0].message.speakerName, "Nabspy");
            assert.deepEqual(posted.pending, []);
        });

        test("teammates the user names answer directly, in the order named, each triaging first", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const posted = await service.postMessage(turn(session.id, "Raj and Ana, what do you think?"));
            assert.equal(posted.replies[0].message.speakerName, "Raj");
            assert.equal(fake.calls[0].context.speakerRole, DISCUSSION_SPEAKER_ROLES.addressed);
            assert.deepEqual(posted.pending.map(speaker => speaker.name), ["Ana"]);
            await service.continueTurn(WORKSPACE, session.id);
            const steps = fake.calls.slice(2).map(call => `${call.step}:${call.context.participant.name}:${call.context.speakerRole}`);
            assert.deepEqual(steps, ["triage:Ana:addressed", "answer:Ana:addressed"]);
        });

        test("naming only the lead is an ordinary lead turn", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            await service.postMessage(turn(session.id, "Nabspy, status?"));
            assert.equal(fake.calls[0].context.speakerRole, DISCUSSION_SPEAKER_ROLES.lead);
        });

        test("a new message ends the previous turn's queue", async () => {
            const fake = fakeRuntime();
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const first = await service.postMessage(turn(session.id, "Ana and Raj, review this"));
            assert.equal(first.pending.length, 1);
            const second = await service.postMessage(turn(session.id, "Never mind"));
            assert.deepEqual(second.pending, []);
            await assert.rejects(() => service.continueTurn(WORKSPACE, session.id), /No teammate is waiting/);
        });

        test("a queued teammate who left the team is skipped", async () => {
            const fake = fakeRuntime();
            const { service, roster } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            await service.postMessage(turn(session.id, "Ana and Raj, review this"));
            roster.members = [lead, ana];
            const continued = await service.continueTurn(WORKSPACE, session.id);
            assert.equal(continued.reply, null);
            assert.deepEqual(continued.pending, []);
        });

        test("usage totals grow with every reply of the turn", async () => {
            const { service } = build();
            const session = await service.createSession({ workspaceId: WORKSPACE, teamId: "team-1", createdBy: USER });
            const posted = await service.postMessage(turn(session.id, "Ana and Raj, review this"));
            const continued = await service.continueTurn(WORKSPACE, session.id);
            assert.equal(continued.usage.outputTokens, posted.usage.outputTokens + 40);
            assert.ok(Math.abs(continued.usage.costUsd - 0.04) < 1e-9);
        });
    });

    describe("memory", () => {
        test("older messages are folded into the summary in the background, keeping the most recent ones verbatim", async () => {
            const fake = fakeRuntime(() => ({ intent: DISCUSSION_INTENTS.conversational, reply: "ok", handoffs: [] }));
            const { service } = build({ runtime: fake.runtime });
            const session = await service.createSession({ workspaceId: WORKSPACE, agentId: solo.agentId, createdBy: USER });
            const turnsToTrigger = Math.floor(DISCUSSION_MEMORY.triggerAfter / 2) + 1;
            for (let index = 0; index < turnsToTrigger; index++) await service.postMessage(turn(session.id, `message ${index}`));
            await nextTick(); await nextTick();

            const total = turnsToTrigger * 2;
            const row = fixture.sessions.get(session.id);
            assert.equal(row.summary, "Summary.");
            assert.equal(row.summarizedMessageCount, total - DISCUSSION_MEMORY.keepRecent);
            assert.deepEqual(fake.summaries, [{ count: total - DISCUSSION_MEMORY.keepRecent }]);
            assert.equal(row.outputTokens, (turnsToTrigger + 1) * USAGE.outputTokens, "the summary call's usage is counted too");

            await service.postMessage(turn(session.id, "after"));
            const context = fake.calls[fake.calls.length - 1].context;
            assert.equal(context.summary, "Summary.");
            assert.equal(context.transcript.length, DISCUSSION_MEMORY.keepRecent, "only messages outside the summary are sent");
        });
    });
});
