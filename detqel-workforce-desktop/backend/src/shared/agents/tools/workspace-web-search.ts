import type { WebContext } from "../graphs/discussion-runtime.js";
import { TavilyWebSearchTool } from "./tavily.tool.js";

/** Web search for a workspace's agents, using the Tavily key that workspace saved in Settings. */
export interface IWorkspaceWebSearch {
    /** Fails with an actionable message when the workspace has no usable key saved. */
    assertConfigured(workspaceId: string): Promise<void>;
    search(workspaceId: string, query: string, maxResults: number): Promise<WebContext[]>;
}

export class WorkspaceWebSearch implements IWorkspaceWebSearch {
    /** resolveKey returns the workspace's decrypted key, or throws when none is saved. */
    constructor(private readonly resolveKey: (workspaceId: string) => Promise<string>) {}

    async assertConfigured(workspaceId: string): Promise<void> {
        await this.resolveKey(workspaceId);
    }

    async search(workspaceId: string, query: string, maxResults: number): Promise<WebContext[]> {
        // The key is read per search, so a key changed in Settings applies to the very next turn.
        const tool = new TavilyWebSearchTool({ apiKey: await this.resolveKey(workspaceId) });
        const response = await tool.search(query, { maxResults });
        return response.results.map(result => ({ title: result.title || result.url, url: result.url, snippet: result.snippet }));
    }
}
