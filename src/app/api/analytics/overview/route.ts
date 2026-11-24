import { requireOrganizationRole, assertTenantOwnership } from "@/lib/rbac";
import { NextRequest, NextResponse } from "next/server";
import {
  getSessionFromRequest,
  isAuthorizedRole,
  normalizeUserRole,
  DEV_DEMO_ACCOUNTS,
} from "@/lib/auth";
import {
  getCalls,
  getLeads,
  getAgents,
  getCampaigns,
  getOrganizations,
  addOrganization,
} from "@/lib/store";
import { connectToDatabase } from "@/lib/db";
import Organization from "@/models/Organization";
import User from "@/models/User";
import Agent from "@/models/Agent";
import Campaign from "@/models/Campaign";
import Lead from "@/models/Lead";
import Call from "@/models/Call";
import { bolnaService } from "@/lib/bolna/client";
import { formatDuration } from "@/lib/utils";
import { computeAgentMetrics } from "@/lib/analytics-counters";

function getInMemoryUsers() {
  if (!(global as any).__INDIACALLING_TEAM_USERS__) {
    (global as any).__INDIACALLING_TEAM_USERS__ = DEV_DEMO_ACCOUNTS.map(
      ({ password, ...u }) => ({
        _id: u.userId,
        name: u.name,
        email: u.email,
        role: u.role,
        organizationId: u.organizationId || "org_default_01",
        isActive: true,
      })
    );
  }
  return (global as any).__INDIACALLING_TEAM_USERS__ as any[];
}

export async function GET(req: NextRequest) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  const session = getSessionFromRequest(req);
  const isSuperAdmin = session
    ? false
    : false;
  const orgId = session?.organizationId || "org_default_01";

  const db = await connectToDatabase();
  let allUsers: any[] = getInMemoryUsers();
  let allOrgs = getOrganizations();
  let allCalls = getCalls();
  let allLeads = getLeads();
  let allAgents = getAgents();
  let allCampaigns = getCampaigns();

  if (db) {
    try {
      const [dbOrgs, dbUsers, dbAgents, dbCamps, dbLeads, dbCalls] =
        await Promise.all([
          Organization.find({}).sort({ createdAt: -1 }).lean(),
          User.find({}).select("-password").lean(),
          Agent.find({}).lean(),
          Campaign.find({}).lean(),
          Lead.find({}).lean(),
          Call.find({}).lean(),
        ]);
      if (dbOrgs.length > 0) {
        allOrgs = dbOrgs.map((o: any) => ({ ...o, _id: String(o._id) }));
        for (const o of allOrgs) {
          addOrganization(o);
        }
      }
      if (dbUsers.length > 0) {
        allUsers = dbUsers.map((u: any) => ({
          ...u,
          _id: String(u._id),
          role: normalizeUserRole(u.role),
        }));
      }
      if (dbAgents.length > 0) {
        allAgents = dbAgents.map((a: any) => ({ ...a, _id: String(a._id) }));
      }
      if (dbCamps.length > 0) {
        allCampaigns = dbCamps.map((c: any) => ({ ...c, _id: String(c._id) }));
      }
      if (dbLeads.length > 0) {
        allLeads = dbLeads.map((l: any) => ({ ...l, _id: String(l._id) }));
      }
      if (dbCalls.length > 0) {
        allCalls = dbCalls.map((c: any) => ({ ...c, _id: String(c._id) }));
      }
    } catch {
      // Fallback to in-memory store
    }
  }

  // Period / Date filter support (case-insensitive: today, 7d, 30d, 90d, all)
  const rawPeriod =
    req.nextUrl.searchParams.get("period") ||
    req.nextUrl.searchParams.get("timeRange") ||
    req.nextUrl.searchParams.get("range") ||
    "7d";
  const period = rawPeriod.trim().toLowerCase();

  const now = new Date();
  let cutoffTimestamp = 0;
  if (period === "today" || period === "1d") {
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );
    cutoffTimestamp = startOfToday.getTime();
  } else if (period === "7d") {
    cutoffTimestamp = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  } else if (period === "30d") {
    cutoffTimestamp = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  } else if (period === "90d") {
    cutoffTimestamp = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  } else {
    cutoffTimestamp = 0; // "all"
  }

  // Strict Organization & Owned-Agent Scoped Slices
  const agents = allAgents.filter((a) => String(a.organizationId) === String(orgId));
  const orgAgentIdSet = new Set(agents.map((a) => String(a._id)));
  const orgBolnaIdSet = new Set(
    agents.map((a) => String(a.bolnaAgentId || "")).filter(Boolean)
  );
  const tenantCalls = allCalls.filter((c) => {
    if (String(c.organizationId) !== String(orgId)) return false;
    if (c.direction === "web_call" || c.isSimulated) return false;
    if (orgAgentIdSet.size === 0) return false;
    return (
      orgAgentIdSet.has(String(c.agentId || "")) ||
      (c.bolnaAgentId && orgBolnaIdSet.has(String(c.bolnaAgentId)))
    );
  });
  const leads = allLeads.filter((l) => String(l.organizationId) === String(orgId));
  const campaigns = isSuperAdmin
    ? allCampaigns
    : allCampaigns.filter((c) => String(c.organizationId) === String(orgId));

  // Time-window filtered calls for the active filter
  const calls =
    cutoffTimestamp > 0
      ? tenantCalls.filter((c) => {
          const t = new Date(c.startedAt || c.createdAt).getTime();
          return !isNaN(t) && t >= cutoffTimestamp;
        })
      : tenantCalls;

  const totalCalls = calls.length;
  const successfulCalls = calls.filter((c) => c.status === "completed").length;
  const failedCalls = calls.filter(
    (c) =>
      c.status === "failed" ||
      c.status === "busy" ||
      c.status === "no_answer" ||
      c.status === "cancelled"
  ).length;
  const queuedCalls = calls.filter(
    (c) =>
      c.status === "queued" ||
      c.status === "initiated" ||
      c.status === "ringing" ||
      c.status === "in_progress"
  ).length;
  const qualifiedLeadKeys = new Set<string>();
  for (const l of leads) {
    if (l.qualificationStatus === "qualified") {
      qualifiedLeadKeys.add(String(l._id));
    }
  }
  for (const c of calls) {
    if (
      c.status === "completed" &&
      (c.qualificationResult?.status === "qualified" ||
        c.qualificationStatus === "qualified")
    ) {
      qualifiedLeadKeys.add(
        String(
          c.leadId ||
            (c.phoneNumber && c.phoneNumber !== "Unknown"
              ? c.phoneNumber
              : c._id)
        )
      );
    }
  }
  const qualifiedLeads = qualifiedLeadKeys.size;
  const conversionRate =
    totalCalls > 0
      ? parseFloat(((qualifiedLeads / totalCalls) * 100).toFixed(1))
      : 0;

  const totalSecs = calls.reduce((acc, c) => acc + (c.durationSeconds || 0), 0);
  const avgDurationSeconds =
    totalCalls > 0 ? Math.round(totalSecs / totalCalls) : 0;
  const totalMinutes = Math.ceil(totalSecs / 60);
  const usageCostInr = Number((totalMinutes * 6).toFixed(2));

  const pendingCount = leads.filter(
    (l) =>
      !qualifiedLeadKeys.has(String(l._id)) &&
      (l.qualificationStatus === "pending_qualification" ||
        l.qualificationStatus === "new" ||
        !l.qualificationStatus)
  ).length;
  const unqualifiedCount = leads.filter(
    (l) =>
      !qualifiedLeadKeys.has(String(l._id)) &&
      (String(l.qualificationStatus) === "unqualified" ||
        String(l.qualificationStatus) === "lost" ||
        l.qualificationStatus === "do_not_contact")
  ).length;

  const qualificationDistribution = [
    { name: "Qualified", value: qualifiedLeads, color: "#16A36A" },
    { name: "Pending", value: pendingCount, color: "#F59E0B" },
    { name: "Unqualified", value: unqualifiedCount, color: "#EF4444" },
  ];

  const agentPerformance = agents.map((agent) => {
    const m = computeAgentMetrics(agent, calls, leads, campaigns);
    return {
      agentId: String(agent._id),
      agentName: agent.name,
      name: agent.name,
      type:
        agent.agentType === "both"
          ? "Bilingual"
          : agent.agentType === "outbound"
          ? "Outbound"
          : "Inbound",
      calls: m.totalCalls,
      totalCalls: m.totalCalls,
      answeredRate:
        m.totalCalls > 0
          ? parseFloat(((m.successfulCalls / m.totalCalls) * 100).toFixed(1))
          : 0,
      avgDuration: formatDuration(m.avgDurationSeconds),
      qualified: m.qualifiedLeads,
      qualifiedLeads: m.qualifiedLeads,
      conversionRate: m.conversionRate,
      qualificationRate: `${m.conversionRate}%`,
      status: agent.status === "active" ? "Active" : "Inactive",
    };
  });

  const totalCallsInPeriod =
    cutoffTimestamp > 0
      ? allCalls.filter((c) => {
          const t = new Date(c.startedAt || c.createdAt).getTime();
          return !isNaN(t) && t >= cutoffTimestamp;
        }).length
      : allCalls.length;

  // Super Admin Platform Organization Overview (Part 2.2)
  const superAdminOverview = isSuperAdmin
    ? {
        totalOrganizations: allOrgs.length,
        activeOrganizations: allOrgs.filter(
          (o) => !o.status || o.status === "active"
        ).length,
        suspendedOrganizations: allOrgs.filter(
          (o) => o.status === "suspended" || o.status === "inactive"
        ).length,
        pendingOrganizations: allOrgs.filter((o) => o.status === "pending")
          .length,
        totalUsers: allUsers.length,
        totalAgents: allAgents.length,
        totalCampaigns: allCampaigns.length,
        totalCalls: totalCallsInPeriod,
        recentOrganizations: allOrgs.slice(0, 5).map((o) => {
          const oid = String(o._id);
          return {
            _id: oid,
            name: o.name,
            email: o.email,
            industry: o.industry || "General Business",
            status: o.status === "inactive" ? "suspended" : o.status || "active",
            totalUsers: allUsers.filter(
              (u) =>
                String(u.organizationId) === oid ||
                (oid === "org_default_01" &&
                  (!u.organizationId || u.organizationId === "org_default_01"))
            ).length,
            totalAgents: allAgents.filter(
              (a) => String(a.organizationId) === oid
            ).length,
            totalCampaigns: allCampaigns.filter(
              (c) => String(c.organizationId) === oid
            ).length,
            totalCalls: allCalls.filter((c) => {
              if (String(c.organizationId) !== oid) return false;
              if (cutoffTimestamp > 0) {
                const t = new Date(c.startedAt || c.createdAt).getTime();
                return !isNaN(t) && t >= cutoffTimestamp;
              }
              return true;
            }).length,
            createdAt: o.createdAt,
          };
        }),
        recentCampaigns: allCampaigns.slice(0, 5).map((camp: any) => {
          const matchedAgent = allAgents.find(
            (a) =>
              String(a._id) === String(camp.agentId) ||
              (a.bolnaAgentId && a.bolnaAgentId === camp.agentId)
          );
          return {
            ...camp,
            agentName:
              camp.agentName ||
              matchedAgent?.name ||
              (camp.agentId
                ? `Agent (${String(camp.agentId).slice(0, 8)})`
                : "Unassigned"),
            totalLeads:
              camp.totalLeads ||
              (camp.leadIds ? camp.leadIds.length : 0),
          };
        }),
        integrationHealth: {
          bolnaConnected: !bolnaService.isMockMode,
          bolnaBaseUrl: bolnaService.baseUrl,
          geminiConfigured: Boolean(
            process.env.GEMINI_API_KEY &&
              !process.env.GEMINI_API_KEY.includes("your_google")
          ),
          mongodbConnected: Boolean(db),
        },
      }
    : null;

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayCounts: Record<string, number> = {
    Mon: 0,
    Tue: 0,
    Wed: 0,
    Thu: 0,
    Fri: 0,
    Sat: 0,
    Sun: 0,
  };
  for (const c of calls) {
    const d = new Date(c.startedAt || c.createdAt);
    if (!isNaN(d.getTime())) {
      const dayName = daysOfWeek[d.getDay()];
      if (dayCounts[dayName] !== undefined) {
        dayCounts[dayName] += 1;
      }
    }
  }
  const activityChart = [
    { day: "Mon", calls: dayCounts["Mon"] },
    { day: "Tue", calls: dayCounts["Tue"] },
    { day: "Wed", calls: dayCounts["Wed"] },
    { day: "Thu", calls: dayCounts["Thu"] },
    { day: "Fri", calls: dayCounts["Fri"] },
    { day: "Sat", calls: dayCounts["Sat"] },
    { day: "Sun", calls: dayCounts["Sun"] },
  ];

  
  const hasRealCalls = calls.length > 0;
  const samplePreviewCalls = hasRealCalls
    ? []
    : [
        {
          _id: "sample_call_1",
          leadName: "Sample Prospect — Aarav Mehta",
          phoneNumber: "+919800000001",
          agentName: agents[0]?.name || "Sample Voice Agent",
          status: "completed",
          durationSeconds: 142,
          qualificationStatus: "qualified",
          costInr: 18,
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          isSample: true,
        },
        {
          _id: "sample_call_2",
          leadName: "Sample Prospect — Sneha Iyer",
          phoneNumber: "+919800000002",
          agentName: agents[0]?.name || "Sample Voice Agent",
          status: "completed",
          durationSeconds: 95,
          qualificationStatus: "follow_up",
          costInr: 12,
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          isSample: true,
        },
        {
          _id: "sample_call_3",
          leadName: "Sample Prospect — Kabir Nair",
          phoneNumber: "+919800000003",
          agentName: agents[0]?.name || "Sample Voice Agent",
          status: "no_answer",
          durationSeconds: 0,
          qualificationStatus: "pending",
          costInr: 0,
          createdAt: new Date().toISOString(),
          isSample: true,
        },
      ];

  // Build real date-bucketed dailyTrend for the AreaChart
  const trendBucketDays = period === "7d" ? 7 : period === "90d" ? 30 : 14;
  const dailyMap = new Map<string, { date: string; calls: number; qualified: number }>();
  for (let i = trendBucketDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    dailyMap.set(label, { date: label, calls: 0, qualified: 0 });
  }
  for (const c of calls) {
    const d = new Date(c.startedAt || c.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    if (!dailyMap.has(label)) {
      dailyMap.set(label, { date: label, calls: 0, qualified: 0 });
    }
    const entry = dailyMap.get(label)!;
    entry.calls += 1;
    if (
      c.status === "completed" &&
      (c.qualificationResult?.status === "qualified" ||
        c.qualificationStatus === "qualified")
    ) {
      entry.qualified += 1;
    }
  }
  const dailyTrend = Array.from(dailyMap.values());

  // Build real outcomeDistribution from actual call statuses (non-zero entries)
  const outcomeCounts = [
    { name: "Completed", value: successfulCalls },
    { name: "Failed / No Answer", value: failedCalls },
    { name: "In Progress / Queued", value: queuedCalls },
  ].filter((o) => o.value > 0);
  const outcomeDistribution =
    outcomeCounts.length > 0
      ? outcomeCounts
      : totalCalls > 0
      ? [{ name: "Recorded Calls", value: totalCalls }]
      : [];

  return NextResponse.json({
    isSamplePreview: !hasRealCalls,
    samplePreviewCalls,
    role: session ? normalizeUserRole(session.role) : "organization",
    organizationId: orgId,
    period,
    kpis: {
      totalCalls,
      successfulCalls,
      completedCalls: successfulCalls,
      failedCalls,
      queuedCalls,
      totalContacts: leads.length,
      totalLeads: leads.length,
      totalAgents: agents.length,
      activeAgents: agents.filter((a) => a.status === "active").length,
      activeCampaigns: campaigns.filter((c) => c.status === "running").length,
      usageDurationMinutes: totalMinutes,
      usageCostInr,
      qualifiedLeads,
      conversionRate,
      qualificationRate: conversionRate,
      avgDurationSeconds,
    },
    superAdminOverview,
    activityChart,
    dailyTrend,
    outcomeDistribution,
    qualificationDistribution,
    agentPerformance,
    recentCalls: calls.slice(0, 5),
    recentLeads: leads
      .filter((l) => l.qualificationStatus === "qualified")
      .slice(0, 5),
  });
}
