import { z } from "zod";
import { AUTHORIZATION_HEADER, BASIC_AUTHORIZATION_PREFIX, BEARER_AUTHORIZATION_PREFIX } from "../../../constants/authConstants.js";
import {
    AZURE_DEVOPS_API_VERSION,
    BITBUCKET_AUTHENTICATION,
    CONNECTOR_ADAPTER_KEYS,
    REPOSITORY_HEADERS,
    REPOSITORY_LIMITS,
    REPOSITORY_PROVIDER_DEFAULTS,
} from "../../../constants/connectionConstants.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { httpEndpoint, requiredString } from "./adapter-configuration.js";
import { repositoryHttp, type RepositoryHttp } from "./repository-http.js";

export interface RepositorySummary {
    fullName: string;
    defaultBranch: string | null;
    visibility: string | null;
    webUrl: string | null;
}
export interface RepositoryBranch { name: string; commit: string | null }
export interface RepositoryEntry { name: string; path: string; type: "file" | "directory" | "other" }
export interface RepositoryCommit { id: string; message: string; author: string | null; date: string | null }
export interface RepositoryPullRequest {
    id: string;
    title: string;
    state: string;
    author: string | null;
    sourceBranch: string | null;
    targetBranch: string | null;
    url: string | null;
}

/** One provider's read-only view of a single repository. Paths are relative to the repository root. */
export interface RepositoryClient {
    repository(): Promise<RepositorySummary>;
    branches(limit: number): Promise<RepositoryBranch[]>;
    /** Lists one directory level; `path` is "" for the root. */
    entries(path: string, ref: string): Promise<RepositoryEntry[]>;
    /** A text file's content. */
    file(path: string, ref: string): Promise<string>;
    commits(ref: string, limit: number): Promise<RepositoryCommit[]>;
    /** Open pull requests (merge requests on GitLab). */
    pullRequests(limit: number): Promise<RepositoryPullRequest[]>;
}

export interface RepositoryProvider {
    readonly key: string;
    readonly name: string;
    create(configuration: Record<string, unknown>, timeoutMs: number): RepositoryClient;
}

const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const enc = encodeURIComponent;
const encodePath = (path: string) => path.split("/").map(enc).join("/");
const lastSegment = (path: string) => path.split("/").filter(Boolean).at(-1) ?? path;
const branchName = (ref: string) => ref.replace(/^refs\/heads\//, "");
const notDirectory = () => new AppError(400, "The path is a file. Use the read operation to get its content.");
const notFile = () => new AppError(400, "The path is a directory. List it with the files resource.");

function optionalString(configuration: Record<string, unknown>, key: string): string | undefined {
    const value = configuration[key];
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") throw new AppError(400, `Configuration field '${key}' must be text.`);
    return value.trim() || undefined;
}

/** The provider API root, without a trailing slash. `apiSuffix` is added unless the user already included it. */
function providerBase(value: string, apiSuffix = ""): URL {
    const url = httpEndpoint(value);
    if (url.search) throw new AppError(400, "Enter the server URL without query parameters.");
    const path = url.pathname.replace(/\/+$/, "");
    url.pathname = apiSuffix && path.endsWith(apiSuffix) ? path : `${path}${apiSuffix}`;
    return url;
}

/** Query keys are fixed by this file and kept literal (Azure DevOps uses keys such as `$top`); values are encoded. */
function apiUrl(base: URL, path: string, query: Record<string, string | number | undefined> = {}): URL {
    const url = new URL(base.origin);
    url.pathname = `${base.pathname.replace(/\/+$/, "")}${path}`;
    const pairs = Object.entries(query)
        .filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== "")
        .map(([key, value]) => `${key}=${enc(String(value))}`);
    url.search = pairs.length ? `?${pairs.join("&")}` : "";
    return url;
}

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
    const result = schema.safeParse(data);
    if (!result.success) throw new AppError(502, "The repository provider returned an unexpected response.");
    return result.data;
}

/** Rejects binary content so callers only ever receive readable text. */
export function textContent(content: string): string {
    if (content.includes("\u0000")) throw new AppError(415, "This file is binary. Only text files can be read.");
    return content;
}

function base64Text(content: string | null | undefined): string {
    if (!content) throw new AppError(413, "The provider did not return this file's content. It may be too large.");
    return textContent(Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8"));
}

function entryType(isDirectory: boolean, isFile: boolean): RepositoryEntry["type"] {
    return isDirectory ? "directory" : isFile ? "file" : "other";
}

function bearer(token: string): string {
    return `${BEARER_AUTHORIZATION_PREFIX}${token}`;
}

function basic(username: string, password: string): string {
    if (username.includes(":")) throw new AppError(400, "The username cannot contain a colon.");
    return `${BASIC_AUTHORIZATION_PREFIX}${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

// ---- GitHub and Gitea / Forgejo share one REST shape ----

const githubRepository = z.object({
    full_name: z.string(), default_branch: z.string().nullish(), private: z.boolean().optional(), html_url: z.string().nullish(),
});
const githubBranches = z.array(z.object({ name: z.string(), commit: z.object({ sha: z.string().optional(), id: z.string().optional() }).nullish() }));
const githubEntries = z.array(z.object({ name: z.string(), path: z.string(), type: z.string() }));
const githubFile = z.object({ type: z.string(), content: z.string().nullish() });
const githubCommits = z.array(z.object({
    sha: z.string(),
    commit: z.object({ message: z.string(), author: z.object({ name: z.string().nullish(), date: z.string().nullish() }).nullish() }),
}));
const githubPulls = z.array(z.object({
    number: z.number(), title: z.string(), state: z.string(), user: z.object({ login: z.string() }).nullish(),
    head: z.object({ ref: z.string() }).nullish(), base: z.object({ ref: z.string() }).nullish(), html_url: z.string().nullish(),
}));

function githubStyleClient(http: RepositoryHttp, base: URL, owner: string, repository: string, pageParam: "per_page" | "limit"): RepositoryClient {
    const root = `/repos/${enc(owner)}/${enc(repository)}`;
    const contents = (path: string) => `${root}/contents${path ? `/${encodePath(path)}` : ""}`;
    return {
        async repository() {
            const repo = parse(githubRepository, await http.json(apiUrl(base, root)));
            return {
                fullName: repo.full_name,
                defaultBranch: repo.default_branch ?? null,
                visibility: repo.private === undefined ? null : repo.private ? "private" : "public",
                webUrl: repo.html_url ?? null,
            };
        },
        async branches(limit) {
            const branches = parse(githubBranches, await http.json(apiUrl(base, `${root}/branches`, { [pageParam]: limit })));
            return branches.map(branch => ({ name: branch.name, commit: branch.commit?.sha ?? branch.commit?.id ?? null }));
        },
        async entries(path, ref) {
            const data = await http.json(apiUrl(base, contents(path), { ref }));
            if (!Array.isArray(data)) throw notDirectory();
            return parse(githubEntries, data).map(entry => ({ name: entry.name, path: entry.path, type: entryType(entry.type === "dir", entry.type === "file") }));
        },
        async file(path, ref) {
            const data = await http.json(apiUrl(base, contents(path), { ref }));
            if (Array.isArray(data)) throw notFile();
            const file = parse(githubFile, data);
            if (file.type !== "file") throw notFile();
            return base64Text(file.content);
        },
        async commits(ref, limit) {
            const commits = parse(githubCommits, await http.json(apiUrl(base, `${root}/commits`, { sha: ref, [pageParam]: limit })));
            return commits.map(commit => ({ id: commit.sha, message: commit.commit.message, author: commit.commit.author?.name ?? null, date: commit.commit.author?.date ?? null }));
        },
        async pullRequests(limit) {
            const pulls = parse(githubPulls, await http.json(apiUrl(base, `${root}/pulls`, { state: "open", [pageParam]: limit })));
            return pulls.map(pull => ({
                id: String(pull.number), title: pull.title, state: pull.state, author: pull.user?.login ?? null,
                sourceBranch: pull.head?.ref ?? null, targetBranch: pull.base?.ref ?? null, url: pull.html_url ?? null,
            }));
        },
    };
}

const github: RepositoryProvider = {
    key: CONNECTOR_ADAPTER_KEYS.github,
    name: "GitHub",
    create(configuration, timeoutMs) {
        let base = providerBase(optionalString(configuration, "apiUrl") ?? REPOSITORY_PROVIDER_DEFAULTS.githubApiUrl);
        // A pasted github.com web address means the public service, whose API lives on its own host.
        if (base.hostname === "github.com" || base.hostname === "www.github.com") base = providerBase(REPOSITORY_PROVIDER_DEFAULTS.githubApiUrl);
        const headers = new Headers({
            Accept: REPOSITORY_HEADERS.githubAccept,
            [REPOSITORY_HEADERS.githubApiVersionName]: REPOSITORY_HEADERS.githubApiVersion,
            [AUTHORIZATION_HEADER]: bearer(requiredString(configuration, "token")),
        });
        return githubStyleClient(repositoryHttp(base, headers, timeoutMs), base, requiredString(configuration, "owner"), requiredString(configuration, "repository"), "per_page");
    },
};

const gitea: RepositoryProvider = {
    key: CONNECTOR_ADAPTER_KEYS.gitea,
    name: "Gitea / Forgejo",
    create(configuration, timeoutMs) {
        const base = providerBase(requiredString(configuration, "serverUrl"), "/api/v1");
        const headers = new Headers({
            Accept: REPOSITORY_HEADERS.json,
            [AUTHORIZATION_HEADER]: `${REPOSITORY_HEADERS.giteaTokenPrefix}${requiredString(configuration, "token")}`,
        });
        return githubStyleClient(repositoryHttp(base, headers, timeoutMs), base, requiredString(configuration, "owner"), requiredString(configuration, "repository"), "limit");
    },
};

// ---- GitLab ----

const gitlabProject = z.object({
    path_with_namespace: z.string(), default_branch: z.string().nullish(), visibility: z.string().nullish(), web_url: z.string().nullish(),
});
const gitlabBranches = z.array(z.object({ name: z.string(), commit: z.object({ id: z.string() }).nullish() }));
const gitlabTree = z.array(z.object({ name: z.string(), path: z.string(), type: z.string() }));
const gitlabFile = z.object({ content: z.string(), encoding: z.string() });
const gitlabCommits = z.array(z.object({
    id: z.string(), message: z.string().nullish(), title: z.string().nullish(), author_name: z.string().nullish(), authored_date: z.string().nullish(),
}));
const gitlabMergeRequests = z.array(z.object({
    iid: z.number(), title: z.string(), state: z.string(), author: z.object({ username: z.string() }).nullish(),
    source_branch: z.string().nullish(), target_branch: z.string().nullish(), web_url: z.string().nullish(),
}));

const gitlab: RepositoryProvider = {
    key: CONNECTOR_ADAPTER_KEYS.gitlab,
    name: "GitLab",
    create(configuration, timeoutMs) {
        const base = providerBase(optionalString(configuration, "serverUrl") ?? REPOSITORY_PROVIDER_DEFAULTS.gitlabServerUrl, "/api/v4");
        const http = repositoryHttp(base, new Headers({
            Accept: REPOSITORY_HEADERS.json,
            [REPOSITORY_HEADERS.gitlabToken]: requiredString(configuration, "token"),
        }), timeoutMs);
        // GitLab addresses a project by its full namespaced path, URL-encoded as one segment.
        const root = `/projects/${enc(requiredString(configuration, "projectPath"))}`;
        return {
            async repository() {
                const project = parse(gitlabProject, await http.json(apiUrl(base, root)));
                return { fullName: project.path_with_namespace, defaultBranch: project.default_branch ?? null, visibility: project.visibility ?? null, webUrl: project.web_url ?? null };
            },
            async branches(limit) {
                const branches = parse(gitlabBranches, await http.json(apiUrl(base, `${root}/repository/branches`, { per_page: limit })));
                return branches.map(branch => ({ name: branch.name, commit: branch.commit?.id ?? null }));
            },
            async entries(path, ref) {
                const tree = parse(gitlabTree, await http.json(apiUrl(base, `${root}/repository/tree`, { path, ref, per_page: REPOSITORY_LIMITS.maxPageSize })));
                return tree.map(entry => ({ name: entry.name, path: entry.path, type: entryType(entry.type === "tree", entry.type === "blob") }));
            },
            async file(path, ref) {
                const file = parse(gitlabFile, await http.json(apiUrl(base, `${root}/repository/files/${enc(path)}`, { ref })));
                return file.encoding === "base64" ? base64Text(file.content) : textContent(file.content);
            },
            async commits(ref, limit) {
                const commits = parse(gitlabCommits, await http.json(apiUrl(base, `${root}/repository/commits`, { ref_name: ref, per_page: limit })));
                return commits.map(commit => ({ id: commit.id, message: commit.message ?? commit.title ?? "", author: commit.author_name ?? null, date: commit.authored_date ?? null }));
            },
            async pullRequests(limit) {
                const requests = parse(gitlabMergeRequests, await http.json(apiUrl(base, `${root}/merge_requests`, { state: "opened", per_page: limit })));
                return requests.map(request => ({
                    id: String(request.iid), title: request.title, state: request.state, author: request.author?.username ?? null,
                    sourceBranch: request.source_branch ?? null, targetBranch: request.target_branch ?? null, url: request.web_url ?? null,
                }));
            },
        };
    },
};

// ---- Azure DevOps Repos ----

const adoRepository = z.object({
    name: z.string(), defaultBranch: z.string().nullish(), webUrl: z.string().nullish(),
    project: z.object({ name: z.string(), visibility: z.string().nullish() }),
});
const adoList = <S extends z.ZodTypeAny>(item: S) => z.object({ value: z.array(item) });
const adoRef = z.object({ name: z.string(), objectId: z.string().nullish() });
const adoItem = z.object({ path: z.string(), isFolder: z.boolean().optional(), gitObjectType: z.string().nullish(), content: z.string().nullish() });
const adoCommit = z.object({ commitId: z.string(), comment: z.string().nullish(), author: z.object({ name: z.string().nullish(), date: z.string().nullish() }).nullish() });
const adoPullRequest = z.object({
    pullRequestId: z.number(), title: z.string(), status: z.string(), createdBy: z.object({ displayName: z.string() }).nullish(),
    sourceRefName: z.string().nullish(), targetRefName: z.string().nullish(),
});

const azureDevops: RepositoryProvider = {
    key: CONNECTOR_ADAPTER_KEYS.azureDevops,
    name: "Azure DevOps Repos",
    create(configuration, timeoutMs) {
        const base = providerBase(requiredString(configuration, "organizationUrl"));
        // A personal access token is sent as the password of Basic authentication with an empty username.
        const http = repositoryHttp(base, new Headers({
            Accept: REPOSITORY_HEADERS.json,
            [AUTHORIZATION_HEADER]: basic("", requiredString(configuration, "token")),
        }), timeoutMs);
        const root = `/${enc(requiredString(configuration, "project"))}/_apis/git/repositories/${enc(requiredString(configuration, "repository"))}`;
        const url = (path: string, query: Record<string, string | number | undefined> = {}) => apiUrl(base, `${root}${path}`, { ...query, "api-version": AZURE_DEVOPS_API_VERSION });
        const versionType = (ref: string) => (COMMIT_SHA.test(ref) ? "commit" : "branch");
        const version = (ref: string) => ({ "versionDescriptor.version": ref, "versionDescriptor.versionType": versionType(ref) });
        let webUrl: string | null = null;
        return {
            async repository() {
                const repo = parse(adoRepository, await http.json(url("")));
                webUrl = repo.webUrl ?? null;
                return {
                    fullName: `${repo.project.name}/${repo.name}`,
                    defaultBranch: repo.defaultBranch ? branchName(repo.defaultBranch) : null,
                    visibility: repo.project.visibility ?? null,
                    webUrl,
                };
            },
            async branches(limit) {
                const refs = parse(adoList(adoRef), await http.json(url("/refs", { filter: "heads/", $top: limit })));
                return refs.value.map(ref => ({ name: branchName(ref.name), commit: ref.objectId ?? null }));
            },
            async entries(path, ref) {
                const scope = `/${path}`;
                const items = parse(adoList(adoItem), await http.json(url("/items", { scopePath: scope, recursionLevel: "OneLevel", ...version(ref) })));
                // The listing includes the folder itself; a file path lists only that file.
                const children = items.value.filter(item => item.path !== scope);
                if (!children.length && items.value.some(item => item.path === scope && !item.isFolder)) throw notDirectory();
                return children.map(item => ({
                    name: lastSegment(item.path),
                    path: item.path.replace(/^\/+/, ""),
                    type: entryType(Boolean(item.isFolder), item.gitObjectType === "blob" || (!item.isFolder && !item.gitObjectType)),
                }));
            },
            async file(path, ref) {
                const item = parse(adoItem, await http.json(url("/items", { path: `/${path}`, includeContent: "true", ...version(ref) })));
                if (item.isFolder) throw notFile();
                return textContent(item.content ?? "");
            },
            async commits(ref, limit) {
                const commits = parse(adoList(adoCommit), await http.json(url("/commits", {
                    "searchCriteria.itemVersion.version": ref,
                    "searchCriteria.itemVersion.versionType": versionType(ref),
                    "searchCriteria.$top": limit,
                })));
                return commits.value.map(commit => ({ id: commit.commitId, message: commit.comment ?? "", author: commit.author?.name ?? null, date: commit.author?.date ?? null }));
            },
            async pullRequests(limit) {
                const requests = parse(adoList(adoPullRequest), await http.json(url("/pullrequests", { "searchCriteria.status": "active", $top: limit })));
                return requests.value.map(request => ({
                    id: String(request.pullRequestId), title: request.title, state: request.status, author: request.createdBy?.displayName ?? null,
                    sourceBranch: request.sourceRefName ? branchName(request.sourceRefName) : null,
                    targetBranch: request.targetRefName ? branchName(request.targetRefName) : null,
                    url: webUrl ? `${webUrl}/pullrequest/${request.pullRequestId}` : null,
                }));
            },
        };
    },
};

// ---- Bitbucket Cloud ----

const bitbucketPage = <S extends z.ZodTypeAny>(item: S) => z.object({ values: z.array(item) });
const bitbucketRepository = z.object({
    full_name: z.string(), mainbranch: z.object({ name: z.string() }).nullish(), is_private: z.boolean().optional(),
    links: z.object({ html: z.object({ href: z.string() }).nullish() }).nullish(),
});
const bitbucketBranch = z.object({ name: z.string(), target: z.object({ hash: z.string() }).nullish() });
const bitbucketSource = z.object({ path: z.string(), type: z.string() });
const bitbucketCommit = z.object({
    hash: z.string(), message: z.string().nullish(), date: z.string().nullish(),
    author: z.object({ raw: z.string().nullish(), user: z.object({ display_name: z.string() }).nullish() }).nullish(),
});
const bitbucketPullRequest = z.object({
    id: z.number(), title: z.string(), state: z.string(), author: z.object({ display_name: z.string() }).nullish(),
    source: z.object({ branch: z.object({ name: z.string() }).nullish() }).nullish(),
    destination: z.object({ branch: z.object({ name: z.string() }).nullish() }).nullish(),
    links: z.object({ html: z.object({ href: z.string() }).nullish() }).nullish(),
});
// Bitbucket Cloud caps pull request pages at 50 items.
const BITBUCKET_PULL_REQUEST_PAGE = 50;

const bitbucketCloud: RepositoryProvider = {
    key: CONNECTOR_ADAPTER_KEYS.bitbucketCloud,
    name: "Bitbucket Cloud",
    create(configuration, timeoutMs) {
        const base = providerBase(REPOSITORY_PROVIDER_DEFAULTS.bitbucketCloudApiUrl);
        const token = requiredString(configuration, "token");
        const authentication = requiredString(configuration, "authentication");
        if (authentication !== BITBUCKET_AUTHENTICATION.apiToken && authentication !== BITBUCKET_AUTHENTICATION.accessToken) {
            throw new AppError(400, "Select a supported Bitbucket authentication method.");
        }
        // Atlassian API tokens pair with the account email; repository and workspace access tokens are bearer tokens.
        const authorization = authentication === BITBUCKET_AUTHENTICATION.apiToken ? basic(requiredString(configuration, "email"), token) : bearer(token);
        const http = repositoryHttp(base, new Headers({ Accept: REPOSITORY_HEADERS.json, [AUTHORIZATION_HEADER]: authorization }), timeoutMs);
        const root = `/repositories/${enc(requiredString(configuration, "workspace"))}/${enc(requiredString(configuration, "repository"))}`;
        /** Source and commit URLs take the revision as one path segment, so a branch name containing "/" is resolved to its commit. */
        const revision = async (ref: string) => {
            if (!ref.includes("/")) return ref;
            const query = `name="${ref.replace(/["\\]/g, "\\$&")}"`;
            const page = parse(bitbucketPage(bitbucketBranch), await http.json(apiUrl(base, `${root}/refs/branches`, { q: query, pagelen: 1 })));
            const hash = page.values[0]?.target?.hash;
            if (!hash) throw new AppError(404, "The branch was not found in the repository.");
            return hash;
        };
        return {
            async repository() {
                const repo = parse(bitbucketRepository, await http.json(apiUrl(base, root)));
                return {
                    fullName: repo.full_name,
                    defaultBranch: repo.mainbranch?.name ?? null,
                    visibility: repo.is_private === undefined ? null : repo.is_private ? "private" : "public",
                    webUrl: repo.links?.html?.href ?? null,
                };
            },
            async branches(limit) {
                const page = parse(bitbucketPage(bitbucketBranch), await http.json(apiUrl(base, `${root}/refs/branches`, { pagelen: limit })));
                return page.values.map(branch => ({ name: branch.name, commit: branch.target?.hash ?? null }));
            },
            async entries(path, ref) {
                const target = `${root}/src/${enc(await revision(ref))}/${path ? `${encodePath(path)}/` : ""}`;
                const data = await http.json(apiUrl(base, target, { pagelen: REPOSITORY_LIMITS.maxPageSize }));
                if (data === null || typeof data !== "object" || !("values" in data)) throw notDirectory();
                return parse(bitbucketPage(bitbucketSource), data).values.map(entry => ({
                    name: lastSegment(entry.path), path: entry.path, type: entryType(entry.type === "commit_directory", entry.type === "commit_file"),
                }));
            },
            async file(path, ref) {
                return textContent(await http.text(apiUrl(base, `${root}/src/${enc(await revision(ref))}/${encodePath(path)}`)));
            },
            async commits(ref, limit) {
                const page = parse(bitbucketPage(bitbucketCommit), await http.json(apiUrl(base, `${root}/commits/${enc(await revision(ref))}`, { pagelen: limit })));
                return page.values.map(commit => ({
                    id: commit.hash, message: commit.message ?? "", author: commit.author?.user?.display_name ?? commit.author?.raw ?? null, date: commit.date ?? null,
                }));
            },
            async pullRequests(limit) {
                const page = parse(bitbucketPage(bitbucketPullRequest), await http.json(apiUrl(base, `${root}/pullrequests`, {
                    state: "OPEN", pagelen: Math.min(limit, BITBUCKET_PULL_REQUEST_PAGE),
                })));
                return page.values.map(request => ({
                    id: String(request.id), title: request.title, state: request.state, author: request.author?.display_name ?? null,
                    sourceBranch: request.source?.branch?.name ?? null, targetBranch: request.destination?.branch?.name ?? null, url: request.links?.html?.href ?? null,
                }));
            },
        };
    },
};

// ---- Bitbucket Data Center / Server ----

const bitbucketServerRepository = z.object({
    slug: z.string(), project: z.object({ key: z.string() }), public: z.boolean().optional(),
    links: z.object({ self: z.array(z.object({ href: z.string() })).optional() }).optional(),
});
const bitbucketServerDefaultBranch = z.object({ displayId: z.string() }).nullable();
const bitbucketServerBranch = z.object({ displayId: z.string(), latestCommit: z.string().nullish() });
const bitbucketServerBrowse = z.object({
    children: z.object({ values: z.array(z.object({ path: z.object({ components: z.array(z.string()) }), type: z.string() })) }).optional(),
});
const bitbucketServerCommit = z.object({
    id: z.string(), message: z.string().nullish(), authorTimestamp: z.number().nullish(),
    author: z.object({ name: z.string().nullish(), displayName: z.string().nullish() }).nullish(),
});
const bitbucketServerPullRequest = z.object({
    id: z.number(), title: z.string(), state: z.string(), author: z.object({ user: z.object({ displayName: z.string() }) }).nullish(),
    fromRef: z.object({ displayId: z.string() }).nullish(), toRef: z.object({ displayId: z.string() }).nullish(),
    links: z.object({ self: z.array(z.object({ href: z.string() })).optional() }).optional(),
});

const bitbucketDataCenter: RepositoryProvider = {
    key: CONNECTOR_ADAPTER_KEYS.bitbucketDataCenter,
    name: "Bitbucket Data Center",
    create(configuration, timeoutMs) {
        const base = providerBase(requiredString(configuration, "serverUrl"), "/rest/api/1.0");
        const http = repositoryHttp(base, new Headers({
            Accept: REPOSITORY_HEADERS.json,
            [AUTHORIZATION_HEADER]: bearer(requiredString(configuration, "token")),
        }), timeoutMs);
        const root = `/projects/${enc(requiredString(configuration, "projectKey"))}/repos/${enc(requiredString(configuration, "repository"))}`;
        return {
            async repository() {
                const repo = parse(bitbucketServerRepository, await http.json(apiUrl(base, root)));
                let defaultBranch: string | null = null;
                try {
                    defaultBranch = parse(bitbucketServerDefaultBranch, await http.json(apiUrl(base, `${root}/branches/default`)))?.displayId ?? null;
                } catch (error) {
                    // An empty repository has no default branch yet.
                    if (!(error instanceof AppError && error.statusCode === 404)) throw error;
                }
                return {
                    fullName: `${repo.project.key}/${repo.slug}`,
                    defaultBranch,
                    visibility: repo.public === undefined ? null : repo.public ? "public" : "private",
                    webUrl: repo.links?.self?.[0]?.href ?? null,
                };
            },
            async branches(limit) {
                const page = parse(bitbucketPage(bitbucketServerBranch), await http.json(apiUrl(base, `${root}/branches`, { limit })));
                return page.values.map(branch => ({ name: branch.displayId, commit: branch.latestCommit ?? null }));
            },
            async entries(path, ref) {
                const browse = parse(bitbucketServerBrowse, await http.json(apiUrl(base, `${root}/browse${path ? `/${encodePath(path)}` : ""}`, {
                    at: ref, limit: REPOSITORY_LIMITS.maxPageSize,
                })));
                if (!browse.children) throw notDirectory();
                return browse.children.values.map(child => {
                    const relative = child.path.components.join("/");
                    return {
                        name: lastSegment(relative),
                        path: path ? `${path}/${relative}` : relative,
                        type: entryType(child.type === "DIRECTORY", child.type === "FILE"),
                    };
                });
            },
            async file(path, ref) {
                return textContent(await http.text(apiUrl(base, `${root}/raw/${encodePath(path)}`, { at: ref })));
            },
            async commits(ref, limit) {
                const page = parse(bitbucketPage(bitbucketServerCommit), await http.json(apiUrl(base, `${root}/commits`, { until: ref, limit })));
                return page.values.map(commit => ({
                    id: commit.id, message: commit.message ?? "", author: commit.author?.displayName ?? commit.author?.name ?? null,
                    date: commit.authorTimestamp === null || commit.authorTimestamp === undefined ? null : new Date(commit.authorTimestamp).toISOString(),
                }));
            },
            async pullRequests(limit) {
                const page = parse(bitbucketPage(bitbucketServerPullRequest), await http.json(apiUrl(base, `${root}/pull-requests`, { state: "OPEN", limit })));
                return page.values.map(request => ({
                    id: String(request.id), title: request.title, state: request.state, author: request.author?.user.displayName ?? null,
                    sourceBranch: request.fromRef?.displayId ?? null, targetBranch: request.toRef?.displayId ?? null, url: request.links?.self?.[0]?.href ?? null,
                }));
            },
        };
    },
};

export const REPOSITORY_PROVIDERS: readonly RepositoryProvider[] = [github, azureDevops, gitlab, bitbucketCloud, bitbucketDataCenter, gitea];
