import { createHash } from "node:crypto";

export interface AgentPromptFields {
    readonly role: string;
    readonly purpose?: string | null;
    readonly instructions?: string | null;
    readonly systemPrompt?: string | null;
    readonly context?: string | null;
}

export function buildAgentMarkdown(fields: AgentPromptFields): string {
    const seen = new Set<string>();
    const sections: Array<[string, string | null | undefined]> = [["Role", fields.role], ["Purpose", fields.purpose], ["Context", fields.context], ["System instructions", fields.systemPrompt], ["Custom instructions", fields.instructions]];
    return sections.filter((entry): entry is [string, string] => {
        if (!entry[1]?.trim()) return false;
        const key = entry[1].replace(/\s+/g, " ").trim().toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).map(([heading, text]) => `## ${heading}\n${text.trim()}`).join("\n\n") + "\n";
}

export function configuredAgentPrompt(source: string): { source: string; configurationHash: string } {
    const configurationHash = createHash("sha256").update(source).digest("hex");
    return { source: `<!-- agent-configuration: ${configurationHash} -->\n${source}`, configurationHash };
}

export function needsPromptSynchronization(existing: string | null, configurationHash: string): boolean {
    if (existing === null) return true;
    const marker = /^<!-- agent-configuration: ([a-f0-9]{64}) -->\r?\n/.exec(existing);
    // Manually authored files are authoritative. Generated files retain direct edits until agent settings change.
    return marker !== null && marker[1] !== configurationHash;
}
