import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { DiscussionRuntime, addUsage, type DiscussionParticipant, type TurnContext } from "../../src/shared/agents/graphs/discussion-runtime.js";
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

/** A gateway that records each chat request and answers from a script, so turns are deterministic. */
function scriptedGateway(...replies: string[]) {
    const requests: ChatCompletionRequest[] = [];
    const gateway = {
        async chatCompletion(_key: string, request: ChatCompletionRequest) {
            requests.push(request);
            return { content: replies[requests.length - 1] ?? `reply-${requests.length}`, tokensUsed: 12, usage: USAGE };
        },
    } as unknown as LiteLlmClient;
    return { gateway, requests };
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

    test("a non-lead never receives delegation instructions", async () => {
        const { gateway, requests } = scriptedGateway("{}");
        await new DiscussionRuntime(gateway, keys, poml).triage(context({ team, speakerRole: DISCUSSION_SPEAKER_ROLES.addressed }));
        const final = last(requests[0].messages).content;
        assert.ok(final.includes(`PROMPT(${POML_DISCUSSION_IDS.delegationNone})`));
        assert.ok(final.includes(`PROMPT(${POML_DISCUSSION_IDS.addressed})`));
    });
});

describe("DiscussionRuntime.answer", () => {
    test("fast is one call with light reasoning and no retrieval", async () => {
        const { gateway, requests } = scriptedGateway("Answer.");
        let retrieved = false;
        const result = await new DiscussionRuntime(gateway, keys, poml).answer(context({ collaborators: { retrieveKnowledge: async () => { retrieved = true; return []; } } }));
        assert.equal(requests.length, 1);
        assert.equal(retrieved, false);
        assert.equal(requests[0].reasoningEffort, DISCUSSION_REASONING.fastAnswer);
        assert.deepEqual(result.sources, []);
        assert.equal(result.content, "Answer.");
    });

    test("the prompt prefix is stable: persona, team, memory, transcript, then per-turn instructions in the final message", async () => {
        const { gateway, requests } = scriptedGateway("ok");
        await new DiscussionRuntime(gateway, keys, poml).answer(context({
            team,
            speakerRole: DISCUSSION_SPEAKER_ROLES.addressed,
            summary: "Earlier we agreed on Q3.",
            transcript: [{ role: "user", content: "earlier", speakerName: null }, { role: "assistant", content: "answer", speakerName: "Nabspy" }],
            responseMode: DISCUSSION_RESPONSE_MODES.brief,
        }));
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

    test("a lead's answer names the teammates it handed work to", async () => {
        const { gateway, requests } = scriptedGateway("ok");
        await new DiscussionRuntime(gateway, keys, poml).answer(context({ participant: lead, speakerRole: DISCUSSION_SPEAKER_ROLES.lead, team, handoffs: [{ name: "Ana", task: "Size it" }] }));
        const final = last(requests[0].messages).content;
        assert.ok(final.includes(POML_DISCUSSION_IDS.leadHandoff) && final.includes("Ana: Size it"));
    });

    test("a delegate answers its assignment from the lead", async () => {
        const { gateway, requests } = scriptedGateway("ok");
        await new DiscussionRuntime(gateway, keys, poml).answer(context({ team, speakerRole: DISCUSSION_SPEAKER_ROLES.delegate, assignment: { leadName: "Nabspy", task: "Size it" } }));
        const final = last(requests[0].messages).content;
        assert.ok(final.includes(POML_DISCUSSION_IDS.assignment) && final.includes("Size it"));
    });

    test("expert retrieves and cites knowledge, then self-checks, and sums usage across both calls", async () => {
        const { gateway, requests } = scriptedGateway("draft", "checked");
        const result = await new DiscussionRuntime(gateway, keys, poml).answer(context({
            capabilityMode: DISCUSSION_CAPABILITY_MODES.expert,
            collaborators: { retrieveKnowledge: async () => [{ text: "Refunds within 30 days.", source: "policy.txt" }] },
        }));
        assert.equal(requests.length, 2);
        assert.equal(requests[0].reasoningEffort, undefined, "expert uses the provider's default reasoning");
        assert.equal(requests[1].reasoningEffort, DISCUSSION_REASONING.selfCheck);
        assert.ok(last(requests[0].messages).content.includes("Refunds within 30 days."));
        assert.equal(result.content, "checked");
        assert.deepEqual(result.sources.map(source => source.reference), ["policy.txt"]);
        assert.deepEqual(result.usage, addUsage(USAGE, USAGE));
    });

    test("expert searches the web only when enabled", async () => {
        let webCalls = 0;
        const collaborators = { searchWeb: async () => { webCalls++; return [{ title: "T", url: "https://x.test", snippet: "s" }]; } };
        await new DiscussionRuntime(scriptedGateway().gateway, keys, poml).answer(context({ capabilityMode: DISCUSSION_CAPABILITY_MODES.expert, collaborators }));
        assert.equal(webCalls, 0);
        const result = await new DiscussionRuntime(scriptedGateway().gateway, keys, poml).answer(context({ capabilityMode: DISCUSSION_CAPABILITY_MODES.expert, webEnabled: true, collaborators }));
        assert.equal(webCalls, 1);
        assert.ok(result.sources.some(source => source.type === "web" && source.url === "https://x.test"));
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
