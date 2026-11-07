import type { DiscussionParticipant } from "../../../shared/agents/graphs/discussion-runtime.js";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The team members the user named in a message, in the order they were first mentioned. Names come from the
 * team roster, never a fixed list. A name only matches as a whole word, so "Ana" does not match "Analysis".
 */
export function addressedMembers(message: string, members: ReadonlyArray<DiscussionParticipant>): DiscussionParticipant[] {
    const found: Array<{ member: DiscussionParticipant; index: number }> = [];
    for (const member of members) {
        const name = member.name.trim();
        if (!name) continue;
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "iu");
        const match = pattern.exec(message);
        if (match) found.push({ member, index: match.index });
    }
    return found.sort((left, right) => left.index - right.index).map(entry => entry.member);
}
