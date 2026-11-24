import { NextRequest, NextResponse } from "next/server";
import {
  requireSuperAdminRole,
  sanitizeOrganizationForSuperAdmin,
} from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import Organization from "@/models/Organization";
import Agent from "@/models/Agent";
import Campaign from "@/models/Campaign";
import Call from "@/models/Call";
import User from "@/models/User";
import {
  getOrganizations,
  getAgents,
  getCampaigns,
  getCalls,
} from "@/lib/store";
import { bolnaService } from "@/lib/bolna/client";
import { calculateBillingWithGst } from "@/lib/call-scheduling";

interface TelephonyTrendRow {
  period: string;
  totalDispatches: number;
  durationMinutes: number;
  usageAmountInr: number;
  intensityPercent: number;
}

function buildTelephonyTrends(
  calls: any[],
  avgRateInr: number
): {
  daily: TelephonyTrendRow[];
  weekly: TelephonyTrendRow[];
  monthly: TelephonyTrendRow[];
} {
  const rate = avgRateInr > 0 ? avgRateInr : 6;
  const now = new Date();

  // Daily (last 7 days)
  const dailyMap = new Map<string, { count: number; secs: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    dailyMap.set(key, { count: 0, secs: 0 });
  }

  // Weekly (last 4 weeks)
  const weeklyBuckets = [
    { label: "3 Weeks Ago", count: 0, secs: 0 },
    { label: "2 Weeks Ago", count: 0, secs: 0 },
    { label: "Last Week", count: 0, secs: 0 },
    { label: "This Week", count: 0, secs: 0 },
  ];

  // Monthly (last 6 months)
  const monthlyMap = new Map<string, { count: number; secs: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    monthlyMap.set(key, { count: 0, secs: 0 });
  }

  for (const c of calls) {
    const ts = new Date(c.startedAt || c.createdAt || now);
    if (Number.isNaN(ts.getTime())) continue;
    const secs = Number(c.durationSeconds) || 0;

    const dayKey = ts.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    if (dailyMap.has(dayKey)) {
      const entry = dailyMap.get(dayKey)!;
      entry.count += 1;
      entry.secs += secs;
    }

    const diffDays = Math.floor((now.getTime() - ts.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays < 28) {
      const weekIdx = 3 - Math.floor(diffDays / 7);
      if (weeklyBuckets[weekIdx]) {
        weeklyBuckets[weekIdx].count += 1;
        weeklyBuckets[weekIdx].secs += secs;
      }
    }

    const monthKey = ts.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
    if (monthlyMap.has(monthKey)) {
      const entry = monthlyMap.get(monthKey)!;
      entry.count += 1;
      entry.secs += secs;
    }
  }

  const formatRows = (entries: Array<{ period: string; count: number; secs: number }>): TelephonyTrendRow[] => {
    const maxCount = Math.max(...entries.map((e) => e.count), 1);
    return entries.map((e) => {
      const mins = Math.ceil(e.secs / 60);
      return {
        period: e.period,
        totalDispatches: e.count,
        durationMinutes: mins,
        usageAmountInr: Number((mins * rate).toFixed(2)),
        intensityPercent: e.count === 0 ? 0 : Math.max(8, Math.round((e.count / maxCount) * 100)),
      };
    });
  };

  return {
    daily: formatRows(
      Array.from(dailyMap.entries()).map(([period, v]) => ({ period, ...v }))
    ),
    weekly: formatRows(
      weeklyBuckets.map((b) => ({ period: b.label, count: b.count, secs: b.secs }))
    ),
    monthly: formatRows(
      Array.from(monthlyMap.entries()).map(([period, v]) => ({ period, ...v }))
    ),
  };
}

/**
 * GET /api/super-admin/overview
 * Strictly returns platform-level aggregated KPIs, GST (18%) billing breakdowns,
 * Daily/Weekly/Monthly Telephony Activity Trends, and Zero-PII organization metadata.
 * NEVER returns leads, call recordings, transcripts, customer contacts, or KB content.
 */
export async function GET(req: NextRequest) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  const db = await connectToDatabase();

  let orgs: any[] = getOrganizations();
  let agents: any[] = getAgents();
  let campaigns: any[] = getCampaigns();
  let calls: any[] = getCalls();
  let users: any[] = [];

  if (db) {
    const [dbOrgs, dbAgents, dbCamps, dbCalls, dbUsers] = await Promise.all([
      Organization.find({}).sort({ createdAt: -1 }).lean(),
      Agent.find({}).select("_id organizationId status syncStatus").lean(),
      Campaign.find({}).select("_id organizationId status").lean(),
      Call.find({})
        .select("_id organizationId durationSeconds status direction startedAt createdAt")
        .lean(),
      User.find({ role: { $ne: "super_admin" } })
        .select("_id organizationId")
        .lean(),
    ]);
    if (dbOrgs.length > 0) {
      orgs = dbOrgs.map((o: any) => ({ ...o, _id: String(o._id) }));
    }
    if (dbAgents.length > 0) agents = dbAgents;
    if (dbCamps.length > 0) campaigns = dbCamps;
    if (dbCalls.length > 0) calls = dbCalls;
    users = dbUsers;
  }

  let totalRevenueInr = 0;
  let totalGstInr = 0;
  let totalUnbilledInr = 0;
  let totalDueInr = 0;
  let totalMinutes = 0;
  let totalCalls = 0;
  let totalConnectedCalls = 0;
  let totalActiveAgents = 0;

  const sanitizedOrgs = orgs.map((org) => {
    const orgIdStr = String(org._id);
    const orgAgents = agents.filter((a) => String(a.organizationId) === orgIdStr);
    const orgActiveAgents = orgAgents.filter((a) => a.status === "active").length;
    const orgCampaigns = campaigns.filter(
      (c) => String(c.organizationId) === orgIdStr
    );
    const orgCalls = calls.filter(
      (c) => String(c.organizationId) === orgIdStr && c.direction !== "web_call"
    );
    const orgConnectedCalls = orgCalls.filter(
      (c) => c.status === "completed" || Number(c.durationSeconds) > 0
    );
    const orgUsers = users.filter((u) => String(u.organizationId) === orgIdStr);

    const secs = orgCalls.reduce(
      (acc, c) => acc + (Number(c.durationSeconds) || 0),
      0
    );
    const mins = Math.ceil(secs / 60);
    const rawRate = org.billing?.ratePerMinuteInr;
    const rate = !rawRate || rawRate === 3.5 ? 6 : rawRate;
    const paidInr = (Array.isArray(org.billing?.invoices) ? org.billing.invoices : [])
      .filter((inv: any) => inv.type === "usage" && inv.status === "paid")
      .reduce((s: number, inv: any) => s + (Number(inv.amountInr) || 0), 0);

    const gstCalc = calculateBillingWithGst({
      billableMinutes: mins,
      ratePerMinuteInr: rate,
      paidInr,
      gstRatePercent: 18,
    });

    totalRevenueInr += gstCalc.subtotalInr;
    totalGstInr += gstCalc.gstInr;
    totalUnbilledInr += gstCalc.subtotalInr;
    totalDueInr += gstCalc.outstandingInr;
    totalMinutes += mins;
    totalCalls += orgCalls.length;
    totalConnectedCalls += orgConnectedCalls.length;
    totalActiveAgents += orgActiveAgents;

    const baseSanitized = sanitizeOrganizationForSuperAdmin(org, {
      agentCount: orgAgents.length,
      activeAgentCount: orgActiveAgents,
      campaignCount: orgCampaigns.length,
      totalCalls: orgCalls.length,
      totalMinutes: mins,
      totalSpendInr: gstCalc.subtotalInr,
      unbilledSpendInr: gstCalc.subtotalInr,
      dueAmountInr: gstCalc.outstandingInr,
      teamMemberCount: Math.max(orgUsers.length, 1),
    });

    return {
      ...baseSanitized,
      callsDispatched: orgCalls.length,
      callsConnected: orgConnectedCalls.length,
      billableMinutes: mins,
      ratePerMinuteInr: gstCalc.ratePerMinuteInr,
      subtotalInr: gstCalc.subtotalInr,
      gstInr: gstCalc.gstInr,
      totalWithGstInr: gstCalc.totalWithGstInr,
      outstandingInr: gstCalc.outstandingInr,
      walletBalanceInr: Number((org.billing?.balanceInr ?? 2500).toFixed(2)),
      planName: org.billing?.planName || "Growth Pay-As-You-Go",
    };
  });

  const activeOrganizations = sanitizedOrgs.filter(
    (o) => o.status === "active"
  ).length;
  const suspendedOrganizations = sanitizedOrgs.filter(
    (o) => o.status === "suspended"
  ).length;

  const telephonyTrends = buildTelephonyTrends(
    calls.filter((c) => c.direction !== "web_call"),
    6
  );

  return NextResponse.json({
    privacyMode: "zero_pii_enforced",
    kpis: {
      totalOrganizations: sanitizedOrgs.length,
      activeOrganizations,
      suspendedOrganizations,
      totalRevenueInr: Number(totalRevenueInr.toFixed(2)),
      totalGstInr: Number(totalGstInr.toFixed(2)),
      totalGrossRevenueInr: Number((totalRevenueInr + totalGstInr).toFixed(2)),
      totalUnbilledInr: Number(totalUnbilledInr.toFixed(2)),
      totalDueInr: Number(totalDueInr.toFixed(2)),
      totalAgents: agents.length,
      activeAgents: totalActiveAgents,
      totalPlatformCalls: totalCalls,
      totalConnectedCalls,
      totalPlatformMinutes: totalMinutes,
    },
    platformHealth: {
      databaseConnected: Boolean(db),
      bolnaConfigured: bolnaService.hasValidApiKey && !bolnaService.isMockMode,
      zeroPiiActive: true,
    },
    telephonyTrends,
    recentOrganizations: sanitizedOrgs,
  });
}
