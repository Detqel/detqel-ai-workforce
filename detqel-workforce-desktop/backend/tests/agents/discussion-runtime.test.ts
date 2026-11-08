import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { DiscussionRuntime, type DiscussionParticipant, type TurnContext } from "../../src/shared/agents/graphs/discussion-runtime.js";
import type { LiteLlmClient, ChatCompletionRequest } from "../../src/shared/agents/litellm.client.js";
import type { VirtualKeyRegistry } from "../../src/shared/agents/virtual-key.registry.js";
import type { PomlLoader } from "../../src/shared/agents/poml/loader.js";
import { POML_DISCUSSION_IDS } from "../../src/constants/pomlConstants.js";
import {
    DISCUSSION_CAPABILITY_MODES,
    DISCUSSION_INTENTS,
    DISCUSSION_REASONING,
    DISCUSSION_RESPONSE_MODES,
    DISCUSSION_SPEAKER_ROLES,
} from "../../src/constants/discussionConstants.js";

const USAGE = { inputTokens: 10, outputTokens: 2, cachedTokens: 4, costUsd: 0.001 };

/**
 * A gateway that records each chat request and answers from a script, so turns are deterministic. A streamed
 * call delivers its reply in two pieces; `streamed` records which calls were streamed.
 */
function scriptedGateway(...replies: string[]) {
    const requests: ChatCompletionRequest[] = [];
    const streamed: boolean[] = [];
    const reply = () => replies[requests.length - 1] ?? `reply-${requests.length}`;
    const gateway = {
        async chatCompletion(_key: string, request: ChatCompletionRequest) {
            requests.push(request);
            streamed.push(false);
            return { content: reply(), tokensUsed: 12, usage: USAGE };
        },
        async chatCompletionStream(_key: string, request: ChatCompletionRequest, onText: (text: string) => void) {
            requests.push(request);
            streamed.push(true);
            const content = reply();
            const middle = Math.ceil(content.length / 2) - 1;
            onText(content.slice(0, middle));
            onText(content.slice(middle));
            return { content, tokensUsed: 12, usage: USAGE };
        },
    } as unknown as LiteLlmClient;
    return { gateway, requests, streamed };
}

const keys = { async resolveProcessKey() { return { virtualKey: "sk-v", modelAlias: "m" }; } } as unknown as VirtualKeyRegistry;
const poml = {
    async renderAgentPrompt(id: string, options?: { variables?: Record<string, string> }) {
        return `PROMPT(${id})${options?.variables ? JSON.stringify(options.variables) : ""}`;
    },
} as unknown as PomlLoader;

const lead: DiscussionParticipant = { agentId: "a-lead", name: "Nabspy", role: "Lead", promptRef: "a-lead", isLead: true };
const analyst: DiscussionParticipant = { agentId: "a-ana", name: "Ana", role: "Analyst", promptRef: "a-ana", isLead: false };
const team = { name: "Core", purpose: "Ship things", members: [lead, analyst] };

function context(overrides: Partial<TurnContext> = {}): TurnContext {
    return {
        workspaceId: "ws",
        participant: analyst,
        speakerRole: DISCUSSION_SPEAKER_ROLES.solo,
        team: null,
        summary: null,
        transcript: [],
        message: "What is our refund policy?",
        responseMode: DISCUSSION_RESPONSE_MODES.detailed,
        capabilityMode: DISCUSSION_CAPABILITY_MODES.fast,
        webEnabled: false,
        collaborators: {},
        ...overrides,
    };
}

const last = <T>(items: ReadonlyArray<T>): T => items[items.length - 1];

describe("DiscussionRuntime.triage", () => {
    test("a conversational message is answered by the triage call alone, with minimal reasoning and JSON output", async () => {
        const { gateway, requests } = scriptedGateway(JSON.stringify({ intent: "conversational", reply: "Hi there.", delegate: [] }));
        const result = await new DiscussionRuntime(gateway, keys, poml).triage(context({ message: "hey" }));
        assert.equal(requests.length, 1);
        assert.equal(result.intent, DISCUSSION_INTENTS.conversational);
        assert.equal(result.reply, "Hi there.");
        assert.equal(requests[0].reasoningEffort, DISCUSSION_REASONING.triage);
        assert.equal(requests[0].responseFormatJson, true);
        assert.deepEqual(result.usage, USAGE);
    });

    test("malformed triage output is treated as a task, never shown as a reply", async () => {
        const { gateway } = scriptedGateway("not json at all");
        const result = await new DiscussionRuntime(gateway, keys, poml).triage(context());
        assert.equal(result.intent, DISCUSSION_INTENTS.task);
        assert.equal(result.reply, null);
    });

    test("a conversational verdict without a reply is answered as a task", async () => {
        const { gateway } = scriptedGateway(JSON.stringify({ intent: "conversational", reply: "  " }));
        const result = await new DiscussionRuntime(gateway, keys, poml).triage(context());
        assert.equal(result.intent, DISCUSSION_INTENTS.task);
    });

    test("a lead's task triage returns its handoffs and reads fenced JSON", async () => {
        const payload = JSON.stringify({ intent: "task", reply: "", delegate: [{ name: "Ana", task: "Size the market" }, { name: "", task: "x" }] });
        const { gateway, requests } = scriptedGateway("```json\n" + payload + "\n```");
        const result = await new DiscussionRuntime(gateway, keys, poml).triage(context({ participant: lead, speakerRole: DISCUSSION_SPEAKER_ROLES.lead, team }));
        assert.deepEqual(result.handoffs, [{ name: "Ana", task: "Size the market" }]);
        assert.ok(last(requests[0].messages).content.includes(`PROMPT(${POML_DISCUSSION_IDS.delegationLead})`), "lead receives delegation instructions");
    });

    test("triage reads a requested document's title, and never keeps one for a conversational reply", async () => {
        const runtime = (reply: unknown) => new DiscussionRuntime(scriptedGateway(JSON.stringify(reply)).gateway, keys, poml);
        const asked = await runtime({ intent: "task", reply: "", document: { title: "  AI   Market\nBrief " }, delegate: [] }).triage(context());
        assert.deepEqual(asked.document, { title: "AI Market Brief" });
        assert.equal((await runtime({ intent: "task", reply: "", document: null }).triage(context())).document, null);
        assert.equal((await runtime({ intent: "task", reply: "", document: { title: "  " } }).triage(context())).document, null);
        assert.equal((await runtime({ intent: "conversational", reply: "Hi!", document: { title: "Doc" } }).triage(context())).document, null);
    });

    test("a writer asked for a document is told its reply is that document", async () => {
        const { gateway, requests } = scriptedGateway("ok");
        await new DiscussionRuntime(gateway, keys, poml).write(context({ document: { title: "AI Market Brief" } }), () => {});
        const final = last(requests[0].messages).content;
        assert.ok(final.includes(POML_DISCUSSION_IDS.document) && final.includes('"title":"AI Market Brief"'));
    });

    test("a non-lead never receives delegation instructions", async () => {
        const { gateway, requests } = scriptedGateway("{}");
        await new DiscussionRuntime(gateway, keys, poml).triage(context({ team, speakerRole: DISCUSSION_SPEAKER_ROLES.addressed }));
        const final = last(requests[0].messages).content;
        assert.ok(final.includes(`PROMPT(${POML_DISCUSSION_IDS.delegationNone})`));
        assert.ok(final.includes(`PROMPT(${POML_DISCUSSION_IDS.addressed})`));
    });
});

describe("DiscussionRuntime replies", () => {
    test("fast writes in one streamed call with light reasoning, passing the text on as it arrives", async () => {
        const { gateway, requests, streamed } = scriptedGateway("Answer.");
        const pieces: string[] = [];
        const result = await new DiscussionRuntime(gateway, keys, poml).write(context(), text => pieces.push(text));
        assert.equal(requests.length, 1);
        assert.deepEqual(streamed, [true]);
        assert.equal(requests[0].reasoningEffort, DISCUSSION_REASONING.fastAnswer);
        assert.equal(result.content, "Answer.");
        assert.deepEqual(pieces, ["Ans", "wer."]);
    });

    test("the prompt prefix is stable: persona, team, memory, transcript, then per-turn instructions in the final message", async () => {
        const { gateway, requests } = scriptedGateway("ok");
        await new DiscussionRuntime(gateway, keys, poml).write(context({
            team,
            speakerRole: DISCUSSION_SPEAKER_ROLES.addressed,
            summary: "Earlier we agreed on Q3.",
            transcript: [{ role: "user", content: "earlier", speakerName: null }, { role: "assistant", content: "answer", speakerName: "Nabspy" }],
            responseMode: DISCUSSION_RESPONSE_MODES.brief,
        }), () => {});
        const [system, first, second, final] = requests[0].messages;
        assert.equal(system.role, "system");
        assert.ok(system.content.startsWith("PROMPT(a-ana)"), "persona comes first");
        assert.ok(system.content.includes(POML_DISCUSSION_IDS.team) && system.content.includes("Earlier we agreed on Q3."));
        assert.ok(!/Answer briefly/.test(system.content), "per-turn style never enters the cached prefix");
        assert.equal(first.content, "earlier");
        assert.equal(second.content, "[Nabspy] answer", "team replies are labelled with the speaker");
        assert.equal(final.role, "user");
        assert.ok(/Answer briefly/.test(final.content) && final.content.endsWith("What is our refund policy?"));
    });

    test("a lead's reply names the teammates it handed work to", async () => {
        const { gateway, requests } = scriptedGateway("ok");
        await new DiscussionRuntime(gateway, keys, poml).write(context({ participant: lead, speakerRole: DISCUSSION_SPEAKER_ROLES.lead, team, handoffs: [{ name: "Ana", task: "Size it" }] }), () => {});
        const final = last(requests[0].messages).content;
        assert.ok(final.includes(POML_DISCUSSION_IDS.leadHandoff) && final.includes("Ana: Size it"));
    });

    test("the lead's wrap-up names the teammates whose contributions it brings together", async () => {
        const { gateway, requests } = scriptedGateway("ok");
        const runtime = new DiscussionRuntime(gateway, keys, poml);
        await runtime.write(context({ participant: lead, speakerRole: DISCUSSION_SPEAKER_ROLES.wrapUp, team, contributors: ["Ana", "Raj"] }), () => {});
        const final = last(requests[0].messages).content;
        assert.ok(final.includes(POML_DISCUSSION_IDS.leadWrapUp) && final.includes('"contributors":"Ana, Raj"'));
        assert.ok(!final.includes(POML_DISCUSSION_IDS.leadHandoff), "the wrap-up is not another handoff");
        await runtime.write(context({ participant: lead, speakerRole: DISCUSSION_SPEAKER_ROLES.wrapUp, team }), () => {});
        assert.ok(last(requests[1].messages).content.includes('"contributors":"Your teammates"'), "a resumed wrap-up without names still reads naturally");
    });

    test("a delegate answers its assignment from the lead", async () => {
        const { gateway, requests } = scriptedGateway("ok");
        await new DiscussionRuntime(gateway, keys, poml).write(context({ team, speakerRole: DISCUSSION_SPEAKER_ROLES.delegate, assignment: { leadName: "Nabspy", task: "Size it" } }), () => {});
        const final = last(requests[0].messages).content;
        assert.ok(final.includes(POML_DISCUSSION_IDS.assignment) && final.includes("Size it"));
    });

    test("expert drafts with default reasoning from the grounding, then streams the reviewed reply", async () => {
        const { gateway, requests, streamed } = scriptedGateway("draft text", "checked");
        const runtime = new DiscussionRuntime(gateway, keys, poml);
        const expert = context({ capabilityMode: DISCUSSION_CAPABILITY_MODES.expert });
        const grounding = runtime.grounding(["[knowledge: policy.txt] Refunds within 30 days."]);
        const draft = await runtime.draft(expert, grounding);
        const pieces: string[] = [];
        const reviewed = await runtime.review(expert, grounding, draft.content, text => pieces.push(text));
        assert.deepEqual(streamed, [false, true], "only the reviewed reply streams");
        assert.equal(requests[0].reasoningEffort, undefined, "the draft uses the provider's default reasoning");
        assert.equal(requests[1].reasoningEffort, DISCUSSION_REASONING.selfCheck);
        assert.ok(last(requests[0].messages).content.includes("Refunds within 30 days."));
        assert.ok(last(requests[1].messages).content.includes("draft text"));
        assert.equal(reviewed.content, "checked");
        assert.equal(pieces.join(""), "checked");
    });

    test("knowledge and web searches return citable sources, and web search only runs when enabled", async () => {
        const runtime = new DiscussionRuntime(scriptedGateway().gateway, keys, poml);
        let webCalls = 0;
        const collaborators = {
            retrieveKnowledge: async () => [{ text: "Refunds within 30 days.", source: "policy.txt" }],
            searchWeb: async () => { webCalls++; return [{ title: "T", url: "https://x.test", snippet: "s" }]; },
        };
        const knowledge = await runtime.searchKnowledge(context({ collaborators }));
        assert.deepEqual(knowledge.sources.map(source => source.reference), ["policy.txt"]);
        assert.deepEqual((await runtime.searchWeb(context({ collaborators }))).sources, []);
        assert.equal(webCalls, 0);
        const web = await runtime.searchWeb(context({ collaborators, webEnabled: true }));
        assert.equal(webCalls, 1);
        assert.ok(web.sources.some(source => source.type === "web" && source.url === "https://x.test"));
        assert.match(runtime.grounding([]), /Nothing relevant was retrieved/);
    });

    test("a delegate searches with its assignment as well as the user's message", () => {
        const runtime = new DiscussionRuntime(scriptedGateway().gateway, keys, poml);
        assert.equal(runtime.searchQuery(context({ assignment: { leadName: "Nabspy", task: "market size" } })), "What is our refund policy?\nmarket size");
    });
});

describe("DiscussionRuntime.summarize", () => {
    test("folds the previous summary and labelled transcript into one minimal-reasoning call", async () => {
        const { gateway, requests } = scriptedGateway("  New summary.  ");
        const result = await new DiscussionRuntime(gateway, keys, poml).summarize("ws", "Old.", [
            { role: "user", content: "Q", speakerName: null },
            { role: "assistant", content: "A", speakerName: "Ana" },
        ]);
        assert.equal(result.summary, "New summary.");
        assert.equal(requests[0].reasoningEffort, DISCUSSION_REASONING.summary);
        const prompt = requests[0].messages[0].content;
        assert.ok(prompt.includes("Old.") && prompt.includes("User: Q") && prompt.includes("Ana: A"));
    });
});
