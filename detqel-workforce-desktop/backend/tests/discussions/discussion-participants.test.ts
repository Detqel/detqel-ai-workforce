import test, { afterEach, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { addressedMembers } from "../../src/modules/discussions/services/discussion-addressing.js";
import { DiscussionParticipants } from "../../src/modules/discussions/services/discussion-participants.js";
import type { IWorkforceRepository } from "../../src/modules/workforce/repositories/workforce.repository.js";
import type { DiscussionParticipant } from "../../src/shared/agents/graphs/discussion-runtime.js";
import { PomlLoader } from "../../src/shared/agents/poml/loader.js";

const WORKSPACE = "11111111-1111-1111-1111-111111111111";

const member = (name: string, isLead = false): DiscussionParticipant => ({ agentId: `id-${name}`, name, role: "r", promptRef: `id-${name}`, isLead });

describe("addressedMembers", () => {
    const roster = [member("Nabspy", true), member("Ana"), member("Raj"), member("Zoë")];

    test("finds named teammates in the order they are mentioned, case-insensitively", () => {
        assert.deepEqual(addressedMembers("raj, then ANA please", roster).map(entry => entry.name), ["Raj", "Ana"]);
    });

    test("matches whole words only", () => {
        assert.deepEqual(addressedMembers("Run the Analysis and the Rajasthan report", roster), []);
    });

    test("handles names with non-ASCII letters and punctuation around them", () => {
        assert.deepEqual(addressedMembers("@Zoë: thoughts?", roster).map(entry => entry.name), ["Zoë"]);
    });

    test("a plain greeting addresses nobody", () => {
        assert.deepEqual(addressedMembers("Hi team", roster), []);
    });

    test("regex characters in a name are matched literally", () => {
        assert.deepEqual(addressedMembers("ask C++ now", [member("C++")]).map(entry => entry.name), ["C++"]);
        assert.deepEqual(addressedMembers("ask Cxx now", [member("C.."), member("C++")]), []);
    });
});

describe("DiscussionParticipants", () => {
    let bundled: string;
    let runtime: string;
    let poml: PomlLoader;
    beforeEach(async () => {
        bundled = await mkdtemp(path.join(tmpdir(), "detqel-participants-bundled-"));
        runtime = await mkdtemp(path.join(tmpdir(), "detqel-participants-runtime-"));
        poml = new PomlLoader({ bundledDirectory: bundled, runtimeDirectory: runtime });
    });
    afterEach(async () => {
        await rm(bundled, { recursive: true, force: true });
        await rm(runtime, { recursive: true, force: true });
    });

    const agent = (id: string, overrides: Record<string, unknown> = {}) => ({
        id,
        customName: null,
        customRole: null,
        customInstructions: null,
        systemPrompt: "Help with planning.",
        template: { name: `Template ${id}`, role: "Planner", summary: "Plans work.", description: "Knows planning.", section: { name: "Operations" } },
        ...overrides,
    });

    function workforce(teamMembers: unknown[]) {
        return {
            async listRecruitedOrganizationAgents(ws: string) { return ws === WORKSPACE ? [agent("a1", { customName: "Vyra" })] : []; },
            async getTeamById(id: string, ws: string) {
                return ws === WORKSPACE && id === "team-1" ? { name: "Core", missionObjective: "Ship", description: null, members: teamMembers } : null;
            },
        } as unknown as IWorkforceRepository;
    }

    test("a solo agent resolves by its recruited id and gets a POML persona written once from its saved fields", async () => {
        const participants = new DiscussionParticipants(workforce([]), poml);
        const solo = await participants.soloAgent(WORKSPACE, "a1");
        assert.deepEqual(solo, { agentId: "a1", name: "Vyra", role: "Planner", promptRef: "a1", isLead: false });
        const persona = await poml.renderAgentPrompt("a1");
        assert.ok(persona.includes("You are Vyra, the Planner in the Operations department."));
        assert.ok(persona.includes("Help with planning."));
    });

    test("a stale persona is rewritten from the saved fields, and an up-to-date one is not written again", async () => {
        await poml.writeUserAgentPrompt("a1", "<poml><role>Outdated role.</role></poml>");
        const participants = new DiscussionParticipants(workforce([]), poml);
        await participants.soloAgent(WORKSPACE, "a1");
        const current = await poml.readUserAgentPrompt("a1");
        assert.ok(current?.includes("You are Vyra, the Planner"), "the outdated persona was replaced");

        const written: string[] = [];
        const write = poml.writeUserAgentPrompt.bind(poml);
        poml.writeUserAgentPrompt = async (id, source) => { written.push(id); await write(id, source); };
        await participants.soloAgent(WORKSPACE, "a1");
        assert.deepEqual(written, [], "an unchanged persona causes no file write");
    });

    test("a template whose description repeats its summary sends that text once", async () => {
        const repeated = "Serves as the research specialist.";
        const directory = {
            async listRecruitedOrganizationAgents() { return [agent("a2", { template: { name: "MAX", role: "Scientist", summary: repeated, description: `  ${repeated.toUpperCase()}\n` } })]; },
            async getTeamById() { return null; },
        } as unknown as IWorkforceRepository;
        await new DiscussionParticipants(directory, poml).soloAgent(WORKSPACE, "a2");
        const persona = await poml.renderAgentPrompt("a2");
        assert.equal(persona.split(repeated).length - 1, 1, "the repeated text appears once");
        assert.ok(!/^##\s*Context/m.test(persona), "the duplicate context section is dropped");
    });

    test("an agent outside the workspace is refused", async () => {
        await assert.rejects(() => new DiscussionParticipants(workforce([]), poml).soloAgent("other", "a1"), /not available/);
    });

    test("a team uses its flagged lead and each agent's own role, with the team role only for an agent without one", async () => {
        const members = [
            { agentId: "m1", isLead: false, memberRole: "Specialist", agent: agent("m1", { customName: "Ana", customRole: "CTO" }) },
            { agentId: "m2", isLead: true, memberRole: "Specialist", agent: agent("m2", { customName: "Nabspy" }) },
            { agentId: "m3", isLead: false, memberRole: "Researcher", agent: agent("m3", { customName: "Raj", template: null }) },
        ];
        const { team, lead } = await new DiscussionParticipants(workforce(members), poml).team(WORKSPACE, "team-1");
        assert.equal(lead.name, "Nabspy");
        assert.equal(team.purpose, "Ship");
        assert.deepEqual(team.members.map(entry => `${entry.name}:${entry.role}:${entry.isLead}`), ["Ana:CTO:false", "Nabspy:Planner:true", "Raj:Researcher:false"]);
    });

    test("without a flagged lead the first member leads; an empty team is refused", async () => {
        const members = [{ agentId: "m1", isLead: false, memberRole: null, agent: agent("m1") }, { agentId: "m2", isLead: false, memberRole: null, agent: agent("m2") }];
        const { lead } = await new DiscussionParticipants(workforce(members), poml).team(WORKSPACE, "team-1");
        assert.equal(lead.agentId, "m1");
        await assert.rejects(() => new DiscussionParticipants(workforce([]), poml).team(WORKSPACE, "team-1"), /no members/);
        await assert.rejects(() => new DiscussionParticipants(workforce(members), poml).team("other", "team-1"), /not available/);
    });
});
