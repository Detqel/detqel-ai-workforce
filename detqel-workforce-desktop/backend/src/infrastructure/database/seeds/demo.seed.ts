import { eq, sql } from "drizzle-orm";
import { hashPassword } from "../../../shared/security/password.js";
import type { AppDatabase } from "../connection.js";
import { userActivities } from "../schema/activities.js";
import { users, workspaceMembers, workspaces } from "../schema/auth.js";
import { businessGoals, businessKnowledge, businessProfile, businessRules, businessState, } from "../schema/business.js";
import { connections } from "../schema/connections.js";
import { missionAgents, missionEvents, missions } from "../schema/missions.js";
import { seedHistory } from "../schema/seeds.js";
import { agentConnections, agents } from "../schema/workforce.js";
export async function seedDemoData(database: AppDatabase) {
    await database.transaction(async (db) => {
        await db.execute(sql `SELECT pg_advisory_xact_lock(1732401, 2)`);
        const applied = await db.query.seedHistory.findFirst({ where: eq(seedHistory.name, "demo-v1") });
        if (applied)
            return;
        const legacyWorkspace = await db.query.workspaces.findFirst({ where: eq(workspaces.slug, "acme-retail") });
        if (legacyWorkspace) {
            const existingAdmin = await db.query.users.findFirst({ where: eq(users.email, "admin@detqel.ai") });
            if (!existingAdmin || legacyWorkspace.createdBy !== existingAdmin.id) {
                throw new Error("Demo workspace slug is already used by another owner; refusing to seed it");
            }
            // Adopt existing demo data without adding another copy of its sample entities.
            const profile = await db.query.businessProfile.findFirst({ where: eq(businessProfile.workspaceId, legacyWorkspace.id) });
            if (profile) {
                await db.insert(seedHistory).values({ name: "demo-v1" });
                return;
            }
        }
        // 1. Create Default Admin User
        const [adminUser] = await db
            .insert(users)
            .values({
            email: "admin@detqel.ai",
            username: "admin",
            name: "DETQEL Admin",
            passwordHash: hashPassword("admin"),
            avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=detqel",
            status: "active",
        })
            .onConflictDoNothing()
            .returning();
        // Create a demo new user with NO workspaces to verify zero-workspace onboarding
        await db
            .insert(users)
            .values({
            email: "newuser@detqel.ai",
            username: "newuser",
            name: "First Time User",
            passwordHash: hashPassword("password123"),
            status: "active",
        })
            .onConflictDoNothing();
        const userId = adminUser?.id || (await db.query.users.findFirst({ where: eq(users.email, "admin@detqel.ai") }))?.id;
        if (!userId)
            throw new Error("Could not find or create admin user");
        // 2. Create Default Workspace (ACME Retail)
        const [workspace] = await db
            .insert(workspaces)
            .values({
            name: "ACME Retail",
            slug: "acme-retail",
            description: "Flagship retail operations workspace for AI Workforce orchestration",
            industry: "Retail & E-Commerce",
            timezone: "America/New_York",
            status: "active",
            createdBy: userId,
        })
            .onConflictDoNothing()
            .returning();
        const workspaceId = workspace?.id || (await db.query.workspaces.findFirst({ where: eq(workspaces.slug, "acme-retail") }))?.id;
        if (!workspaceId)
            throw new Error("Could not find or create workspace");
        // 3. Add Admin as Owner Member
        await db
            .insert(workspaceMembers)
            .values({
            workspaceId,
            userId,
            role: "owner",
            status: "active",
        })
            .onConflictDoNothing();
        // 4. Business Profile
        await db
            .insert(businessProfile)
            .values({
            workspaceId,
            businessName: "ACME Retail Global",
            businessType: "Omnichannel Retailer",
            industry: "Retail & E-commerce",
            description: "High-growth omnichannel consumer goods brand specializing in apparel and lifestyle accessories.",
            productsServices: [
                { name: "EcoWear Line", category: "Apparel", revenueContribution: 0.45 },
                { name: "Urban Living Gear", category: "Accessories", revenueContribution: 0.35 },
                { name: "SubHome Essentials", category: "Home Goods", revenueContribution: 0.2 },
            ],
            customers: [
                { segment: "Direct Consumers (B2C)", share: 0.75 },
                { segment: "Wholesale Boutique Partners (B2B)", share: 0.25 },
            ],
            departments: ["Executive", "Operations", "Finance", "Growth Marketing", "Supply Chain"],
            locations: ["New York, NY", "Austin, TX", "London, UK"],
            businessModel: {
                type: "Direct-to-Consumer & B2B Distribution",
                coreMargins: "58% gross margin",
            },
        })
            .onConflictDoNothing();
        // 5. Business Knowledge & Rules
        await db
            .insert(businessKnowledge)
            .values({
            workspaceId,
            title: "Standard Operating Procedure: Autonomous Purchase Approvals",
            content: "Autonomous agents are authorized to draft purchase orders up to $5,000 automatically. Any commitment exceeding $5,000 requires human-in-the-loop review.",
            sourceType: "document",
            sourceReference: "DOC-OPS-2026-01",
            status: "active",
        })
            .onConflictDoNothing();
        await db
            .insert(businessGoals)
            .values([
            {
                workspaceId,
                title: "Achieve 28% YoY E-commerce Revenue Expansion",
                description: "Accelerate personalized customer acquisition and cross-selling via AI recommendation workflows.",
                goalType: "growth",
                targetValue: 12500000,
                currentValue: 9800000,
                priority: "critical",
                status: "active",
            },
            {
                workspaceId,
                title: "Reduce Stockout Rate Below 2%",
                description: "Real-time automated supply chain prediction and reorder trigger orchestration.",
                goalType: "operations",
                targetValue: 2.0,
                currentValue: 4.8,
                priority: "high",
                status: "active",
            },
        ])
            .onConflictDoNothing();
        await db
            .insert(businessRules)
            .values({
            workspaceId,
            name: "Financial Safety Constraint: Max Agent Transaction",
            description: "Prohibits autonomous execution of transactions over $5,000 without multi-sig approval.",
            ruleType: "financial",
            ruleDefinition: {
                condition: "transaction_amount > 5000",
                action: "require_human_approval",
                level: "critical",
            },
            status: "active",
        })
            .onConflictDoNothing();
        // 6. Connections
        const [conn] = await db
            .insert(connections)
            .values({
            workspaceId,
            name: "PostgreSQL Data Warehouse",
            provider: "Postgres",
            connectionType: "database",
            configuration: { host: "dw.internal.corp", port: 5432, database: "analytics_dw" },
            status: "connected",
            lastSyncedAt: new Date(),
        })
            .onConflictDoNothing()
            .returning();
        // 7. Platform & Custom AI Agents
        const [orchestratorAgent] = await db
            .insert(agents)
            .values({
            workspaceId,
            name: "Workforce Orchestrator",
            description: "Central AI agent responsible for mission decomposition, subagent delegation, and synthesis.",
            purpose: "Orchestrate workforce agents across complex business tasks",
            instructions: "Analyze user intent, build execution plan, assign specialized agents, and verify outcomes.",
            agentType: "platform",
            scope: { domains: ["all"], readAccess: "full", writeAccess: "supervised" },
            capabilities: ["intent_decomposition", "plan_generation", "task_delegation", "result_verification"],
            approvalPolicy: { defaultPolicy: "audit_logged" },
            status: "active",
            createdBy: userId,
        })
            .onConflictDoNothing()
            .returning();
        const [analystAgent] = await db
            .insert(agents)
            .values({
            workspaceId,
            name: "Financial Intelligence Agent",
            description: "Specialized in revenue trend analysis, cashflow projections, and unit economics.",
            purpose: "Generate deep predictive financial intelligence",
            instructions: "Monitor daily revenues, detect variance against targets, and propose margin optimizations.",
            agentType: "platform",
            scope: { domains: ["finance", "sales"], readAccess: "full" },
            capabilities: ["revenue_modeling", "margin_analysis", "variance_detection"],
            approvalPolicy: { defaultPolicy: "audit_logged" },
            status: "active",
            createdBy: userId,
        })
            .onConflictDoNothing()
            .returning();
        if (conn && orchestratorAgent) {
            await db
                .insert(agentConnections)
                .values({
                agentId: orchestratorAgent.id,
                connectionId: conn.id,
                permissions: { read: true, write: false },
            })
                .onConflictDoNothing();
        }
        // 8. Sample Mission
        const [sampleMission] = await db
            .insert(missions)
            .values({
            workspaceId,
            title: "Q4 High-Margin Product Growth Strategy",
            userRequest: "Identify top 3 margin opportunities in apparel line and predict 90-day ROI.",
            intent: {
                category: "market_growth",
                primaryObjective: "identify_growth_opportunities",
            },
            plan: {
                steps: [
                    { step: 1, title: "Query data warehouse for 90-day SKU velocity", status: "completed" },
                    { step: 2, title: "Simulate pricing elasticity at +8% price point", status: "in_progress" },
                    { step: 3, title: "Draft inventory restocking proposal", status: "queued" },
                ],
            },
            status: "investigating",
            priority: "high",
            initiatedBy: userId,
            startedAt: new Date(),
        })
            .onConflictDoNothing()
            .returning();
        if (sampleMission && orchestratorAgent) {
            await db.insert(missionAgents).values({
                missionId: sampleMission.id,
                agentId: orchestratorAgent.id,
                role: "primary",
                status: "working",
            });
            await db.insert(missionEvents).values({
                missionId: sampleMission.id,
                agentId: orchestratorAgent.id,
                eventType: "intent",
                title: "Mission Decomposed",
                description: "Parsed request and assigned Financial Intelligence subagent for SKU analysis.",
            });
        }
        // 9. Initial Business State
        await db
            .insert(businessState)
            .values({
            workspaceId,
            stateType: "overall",
            stateData: {
                healthScore: 94,
                activeMissions: 3,
                workforceUtilization: "78%",
                pendingApprovals: 1,
            },
            confidence: 0.96,
            sourceCount: 5,
        })
            .onConflictDoNothing();
        // 10. Seed Realistic Activity Logs for 4-Week Activity Heatmap across all workspaces
        const activitySamples = [
            // Investigations
            { type: "investigations", title: "SKU Gross Margin Investigation", daysAgo: 1 },
            { type: "investigations", title: "Customer Churn Spike Diagnosis", daysAgo: 3 },
            { type: "investigations", title: "Supply Chain Lead-Time Anomaly", daysAgo: 7 },
            { type: "investigations", title: "Ad Spend ROAS Discrepancy Analysis", daysAgo: 10 },
            { type: "investigations", title: "Inventory Drift Root Cause Investigation", daysAgo: 14 },
            { type: "investigations", title: "Checkout Abandonment Analysis", daysAgo: 18 },
            { type: "investigations", title: "Supplier Price Escalation Investigation", daysAgo: 22 },
            { type: "investigations", title: "B2B Partner Credit Risk Evaluation", daysAgo: 26 },
            // Predictions
            { type: "predictions", title: "Q4 SKU Demand Forecast", daysAgo: 2 },
            { type: "predictions", title: "Peak Holiday Season Revenue Prediction", daysAgo: 4 },
            { type: "predictions", title: "Warehouse Out-of-Stock Probability", daysAgo: 8 },
            { type: "predictions", title: "Omnichannel Margin Forecast", daysAgo: 12 },
            { type: "predictions", title: "Customer Lifetime Value Prediction Model", daysAgo: 16 },
            { type: "predictions", title: "Return Rate Prediction for Apparel Lines", daysAgo: 21 },
            { type: "predictions", title: "Logistics Carrier Delay Forecast", daysAgo: 25 },
            // Simulations
            { type: "simulations", title: "Dynamic Pricing 5% Elasticity Simulation", daysAgo: 2 },
            { type: "simulations", title: "Inventory Buffer Scenario Stress Test", daysAgo: 6 },
            { type: "simulations", title: "Black Friday Flash Sale Simulation", daysAgo: 9 },
            { type: "simulations", title: "Tariff & Freight Rate Surge Scenario", daysAgo: 15 },
            { type: "simulations", title: "Regional Fulfillment Center Relocation Simulation", daysAgo: 20 },
            { type: "simulations", title: "Wholesale Margin Adjustment Simulation", daysAgo: 24 },
            // Automations
            { type: "automations", title: "Automated Daily Reorder Trigger for EcoWear", daysAgo: 1 },
            { type: "automations", title: "Nightly Data Sync & Re-indexing Automation", daysAgo: 5 },
            { type: "automations", title: "Real-time Low Stock Slack Dispatcher", daysAgo: 8 },
            { type: "automations", title: "Weekly Vendor Scorecard Report Generator", daysAgo: 13 },
            { type: "automations", title: "Cart Abandonment Trigger Flow", daysAgo: 17 },
            { type: "automations", title: "Automated Currency Hedge Rebalance", daysAgo: 23 },
            { type: "automations", title: "Regulatory Invoicing Compliance Sync", daysAgo: 27 },
            // Decisions
            { type: "decisions", title: "Purchase Order #8821 Approved ($4,200)", daysAgo: 3 },
            { type: "decisions", title: "Dynamic Discount Rule Authorization", daysAgo: 7 },
            { type: "decisions", title: "New Regional Carrier Onboarding Sign-off", daysAgo: 11 },
            { type: "decisions", title: "Safety Stock Buffer Threshold Revision", daysAgo: 16 },
            { type: "decisions", title: "Quarterly Ad Budget Reallocation Approval", daysAgo: 21 },
            { type: "decisions", title: "Vendor SLA Extension Approved", daysAgo: 26 },
        ];
        const allWorkspaces = await db
            .select({ id: workspaces.id, createdBy: workspaces.createdBy })
            .from(workspaces).where(eq(workspaces.id, workspaceId));
        for (const ws of allWorkspaces) {
            const existingActivities = await db
                .select({ id: userActivities.id })
                .from(userActivities)
                .where(eq(userActivities.workspaceId, ws.id))
                .limit(1);
            if (existingActivities.length === 0) {
                const targetUserId = ws.createdBy || userId;
                const now = new Date();
                for (const item of activitySamples) {
                    const activityTime = new Date(now.getTime() - item.daysAgo * 86400000);
                    await db.insert(userActivities).values({
                        workspaceId: ws.id,
                        userId: targetUserId,
                        activityType: item.type,
                        title: item.title,
                        description: "Logged activity performed by user in workspace.",
                        createdAt: activityTime,
                    });
                }
            }
        }
        await db.insert(seedHistory).values({ name: "demo-v1" });
    });
}
