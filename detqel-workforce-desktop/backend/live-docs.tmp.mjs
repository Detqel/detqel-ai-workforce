import path from "node:path";
import { writeFile } from "node:fs/promises";
import postgres from "postgres";

const runtimeDirectory = path.join(process.env.APPDATA, "com.detqel.workforce", "runtime");
process.env.DETQEL_RUNTIME_DIR = runtimeDirectory;
const WORKSPACE = "35f246b0-8032-4f54-b0ea-d18e155cf2cd";
const { ensureDesktopInfrastructure, stopDesktopInfrastructure } = await import("./dist/desktop/infrastructure/desktop-infrastructure.js");
const { prepareApplicationDatabase } = await import("./dist/desktop/infrastructure/application-database.js");
const signal = new AbortController().signal;
const infra = await ensureDesktopInfrastructure({ runtimeDirectory, assetsDirectory: path.resolve("infrastructure"), signal, report: () => {} });
const sql = postgres(infra.applicationDatabaseUrl, { max: 1, onnotice: () => {} });
let app;
let sessionId;
try {
    await prepareApplicationDatabase({ databaseUrl: infra.applicationDatabaseUrl, signal, report: () => {} });
    const { env } = await import("./dist/config/env.js");
    const { buildApp } = await import("./dist/app.js");
    app = await buildApp({ config: { ...env, DATABASE_URL: infra.applicationDatabaseUrl, LITELLM_BASE_URL: infra.litellmUrl, LITELLM_API_KEY: infra.litellmMasterKey, MILVUS_ADDRESS: infra.milvusUrl, MILVUS_TOKEN: infra.milvusToken }, verifyDatabase: true, logger: false });
    const base = await app.listen({ port: 0, host: "127.0.0.1" });
    const [owner] = await sql`SELECT created_by AS id FROM workspaces WHERE id = ${WORKSPACE}`;
    const [team] = await sql`SELECT id FROM agent_teams WHERE workspace_id = ${WORKSPACE} AND name = 'DETQEL CORE'`;
    const session = await app.services.discussions.createSession({ workspaceId: WORKSPACE, teamId: team.id, createdBy: owner.id });
    sessionId = session.id;
    const auth = { Authorization: `Bearer ${app.services.sessions.issue(owner.id).accessToken}`, "Content-Type": "application/json" };
    const url = `${base}/api/discussions/workspaces/${WORKSPACE}/sessions/${session.id}`;

    const started = Date.now();
    const response = await fetch(`${url}/messages`, {
        method: "POST", headers: auth,
        body: JSON.stringify({ message: "Nabspy, coordinate with your team and generate me a document on the industries with the highest demand for AI initiatives, with a comparison table.", responseMode: "brief", capabilityMode: "fast", webEnabled: false }),
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    const events = [];
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop();
        for (const line of lines.filter(Boolean)) events.push({ ...JSON.parse(line), at: Date.now() - started });
    }
    for (const event of events) {
        if (event.type === "speaker") console.log(`${String(event.at).padStart(6)}ms > ${event.name} [${event.turnRole}]`);
        else if (event.type === "activity" && event.step.status !== "running") console.log(`${String(event.at).padStart(6)}ms     ${event.step.status} ${event.step.kind} ${JSON.stringify(event.step.detail ?? {}).slice(0, 100)}`);
        else if (event.type === "done" || event.type === "error") console.log(`${String(event.at).padStart(6)}ms ${event.type} ${event.message ?? ""}`);
    }
    const replies = events.filter(event => event.type === "reply").map(event => event.message);
    const documentReply = replies.find(message => message.activity.some(step => step.kind === "savingDocument"));
    console.log("\ndocument reply by:", documentReply?.speakerName, documentReply?.turnRole, "starts:", JSON.stringify(documentReply?.content.slice(0, 120)));

    const list = await (await fetch(`${url}/artifacts`, { headers: { Authorization: auth.Authorization } })).json();
    console.log("artifacts after turn:", list.map(item => `${item.fileName} (${item.size} B)`));

    const handoff = replies.find(message => message.turnRole === "delegate");
    for (const format of ["md", "docx", "pdf"]) {
        const exported = await fetch(`${url}/messages/${handoff.id}/export`, { method: "POST", headers: auth, body: JSON.stringify({ format }) });
        const body = await exported.json();
        const bytes = Buffer.from(body.contentBase64, "base64");
        console.log(`export ${format}: HTTP ${exported.status} ${body.fileName} ${bytes.length} B magic=${JSON.stringify(bytes.subarray(0, 5).toString("latin1"))}`);
        if (format !== "md") await writeFile(path.resolve(`live-export.tmp.${format}`), bytes);
    }
    const docName = list.find(item => item.fileName.endsWith(".md"))?.fileName;
    if (docName) {
        const converted = await fetch(`${url}/artifacts/${encodeURIComponent(docName)}/export`, { method: "POST", headers: auth, body: JSON.stringify({ format: "pdf" }) });
        const body = await converted.json();
        console.log(`document to pdf: HTTP ${converted.status} ${body.fileName}`);
        await writeFile(path.resolve("live-document.tmp.pdf"), Buffer.from(body.contentBase64, "base64"));
    }
    const renamed = await fetch(url, { method: "PATCH", headers: auth, body: JSON.stringify({ title: "  AI demand research  " }) });
    console.log("rename:", renamed.status, (await renamed.json()).title);
    const traversal = await fetch(`${url}/artifacts/${encodeURIComponent("..\\secrets.md")}`, { headers: { Authorization: auth.Authorization } });
    console.log("traversal attempt:", traversal.status);
    const finalList = await (await fetch(`${url}/artifacts`, { headers: { Authorization: auth.Authorization } })).json();
    console.log("artifacts at end:", finalList.map(item => item.fileName));
} catch (error) {
    console.error("LIVE FAILED:", error);
    process.exitCode = 1;
} finally {
    if (sessionId) await app?.services.discussions.deleteSession(WORKSPACE, sessionId).catch(error => console.error("cleanup", error));
    await sql.end({ timeout: 5 });
    if (app) await app.close();
    await stopDesktopInfrastructure({ runtimeDirectory });
}
