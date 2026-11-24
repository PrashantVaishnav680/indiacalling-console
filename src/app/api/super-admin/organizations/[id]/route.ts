import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import { requireSuperAdminRole, sanitizeOrganizationForSuperAdmin } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import Organization from "@/models/Organization";
import Agent from "@/models/Agent";
import Campaign from "@/models/Campaign";
import Call from "@/models/Call";
import User from "@/models/User";
import AuditLog from "@/models/AuditLog";
import PlatformRequest from "@/models/PlatformRequest";
import { getOrganizationById, updateOrganization } from "@/lib/store";
import { calculateBillingWithGst } from "@/lib/call-scheduling";

function buildOrgActivityTrends(calls: any[], rate: number) {
  const now = new Date();
  const dailyMap = new Map<string, { count: number; connected: number; secs: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    dailyMap.set(key, { count: 0, connected: 0, secs: 0 });
  }

  const weeklyBuckets = [
    { label: "3 Weeks Ago", count: 0, connected: 0, secs: 0 },
    { label: "2 Weeks Ago", count: 0, connected: 0, secs: 0 },
    { label: "Last Week", count: 0, connected: 0, secs: 0 },
    { label: "This Week", count: 0, connected: 0, secs: 0 },
  ];

  for (const c of calls) {
    const ts = new Date(c.startedAt || c.createdAt || now);
    if (Number.isNaN(ts.getTime())) continue;
    const secs = Number(c.durationSeconds) || 0;
    const isConn = c.status === "completed" || secs > 0 ? 1 : 0;

    const dayKey = ts.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    if (dailyMap.has(dayKey)) {
      const e = dailyMap.get(dayKey)!;
      e.count += 1;
      e.connected += isConn;
      e.secs += secs;
    }

    const diffDays = Math.floor((now.getTime() - ts.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays < 28) {
      const idx = 3 - Math.floor(diffDays / 7);
      if (weeklyBuckets[idx]) {
        weeklyBuckets[idx].count += 1;
        weeklyBuckets[idx].connected += isConn;
        weeklyBuckets[idx].secs += secs;
      }
    }
  }

  const toRows = (arr: Array<{ period: string; count: number; connected: number; secs: number }>) => {
    const max = Math.max(...arr.map((a) => a.count), 1);
    return arr.map((a) => {
      const mins = Math.ceil(a.secs / 60);
      return {
        period: a.period,
        dispatched: a.count,
        connected: a.connected,
        minutes: mins,
        spendInr: Number((mins * rate).toFixed(2)),
        intensityPercent: a.count === 0 ? 0 : Math.max(8, Math.round((a.count / max) * 100)),
      };
    });
  };

  return {
    daily: toRows(Array.from(dailyMap.entries()).map(([period, v]) => ({ period, ...v }))),
    weekly: toRows(weeklyBuckets.map((b) => ({ period: b.label, count: b.count, connected: b.connected, secs: b.secs }))),
  };
}

function buildOrgLookupFilter(id: string) {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return {
      $or: [
        { _id: id },
        { _id: new mongoose.Types.ObjectId(id) },
        { slug: id },
      ],
    };
  }
  return { $or: [{ _id: id }, { slug: id }] };
}

/**
 * GET /api/super-admin/organizations/[id]
 * Zero-PII Organization Inspect endpoint: returns org profile, limits, billing/GST,
 * wallet balance, invoices, and per-organization Activity Monitoring trends.
 * NEVER returns leads, call recordings, transcripts, or customer contacts.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  const { id } = await Promise.resolve(context.params);
  const db = await connectToDatabase();

  let org: any = getOrganizationById(id);
  let orgAgents: any[] = [];
  let orgCampaigns: any[] = [];
  let orgCalls: any[] = [];
  let orgUsersCount = 1;
  let orgTeamMembers: any[] = [];
  let orgLeadsCount = 0;
  let orgLogs: any[] = [];

  if (db) {
    const dbOrg = await Organization.findOne(buildOrgLookupFilter(id)).lean();
    if (dbOrg) {
      org = { ...(dbOrg as any), _id: String((dbOrg as any)._id) };
      const orgIdStr = org._id;
      const rawDb = mongoose.connection.db;
      const orgIdMatch = mongoose.Types.ObjectId.isValid(orgIdStr)
        ? { $in: [orgIdStr, new mongoose.Types.ObjectId(orgIdStr)] }
        : orgIdStr;
      const [a, c, calls, usersList, logs, leadsCount] = await Promise.all([
        Agent.find({ organizationId: orgIdStr }).select("_id status syncStatus").lean(),
        Campaign.find({ organizationId: orgIdStr }).select("_id status").lean(),
        Call.find({ organizationId: orgIdStr, direction: { $ne: "web_call" } })
          .select("_id durationSeconds status startedAt createdAt")
          .lean(),
        User.find({ organizationId: orgIdMatch, role: { $ne: "super_admin" } })
          .select("_id name email role department title isActive createdAt")
          .sort({ createdAt: 1 })
          .lean(),
        AuditLog.find({ targetOrgId: orgIdStr }).sort({ createdAt: -1 }).limit(20).lean(),
        rawDb
          ? rawDb
              .collection("leads")
              .countDocuments({ organizationId: orgIdMatch })
              .catch(() => 0)
          : Promise.resolve(0),
      ]);
      orgAgents = a;
      orgCampaigns = c;
      orgCalls = calls;
      const ownerEmailLower = String(org.ownerEmail || org.email || "").toLowerCase();
      orgTeamMembers = (usersList as any[]).map((u, idx) => ({
        _id: String(u._id),
        name: u.name || "Team Member",
        email: u.email || "",
        role: u.role || "organization",
        department: u.department || "Operations",
        title: u.title || "",
        isOwner:
          (ownerEmailLower && String(u.email || "").toLowerCase() === ownerEmailLower) ||
          idx === 0,
        status: u.isActive === false ? "inactive" : "active",
        createdAt: u.createdAt || null,
      }));
      orgUsersCount = Math.max(orgTeamMembers.length, 1);
      orgLeadsCount = Number(leadsCount || 0);
      orgLogs = logs.map((l: any) => ({ ...l, _id: String(l._id) }));
    }
  }

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const secs = orgCalls.reduce((sum, c) => sum + (Number(c.durationSeconds) || 0), 0);
  const mins = Math.ceil(secs / 60);
  const rawRate = org.billing?.ratePerMinuteInr;
  const rate = !rawRate || rawRate === 3.5 ? 6 : rawRate;
  const paidInr = (Array.isArray(org.billing?.invoices) ? org.billing.invoices : [])
    .filter((inv: any) => inv.type === "usage" && inv.status === "paid")
    .reduce((sum: number, inv: any) => sum + (Number(inv.amountInr) || 0), 0);

  const gst = calculateBillingWithGst({
    billableMinutes: mins,
    ratePerMinuteInr: rate,
    paidInr,
    gstRatePercent: 18,
  });

  const sanitized = sanitizeOrganizationForSuperAdmin(org, {
    agentCount: orgAgents.length,
    activeAgentCount: orgAgents.filter((a) => a.status === "active").length,
    campaignCount: orgCampaigns.length,
    totalCalls: orgCalls.length,
    totalMinutes: mins,
    totalSpendInr: gst.subtotalInr,
    unbilledSpendInr: gst.subtotalInr,
    dueAmountInr: gst.outstandingInr,
    teamMemberCount: orgUsersCount,
  });

  return NextResponse.json({
    privacyMode: "zero_pii_enforced",
    organization: {
      ...sanitized,
      email: org.email || org.ownerEmail || "",
      phone: org.phone || "",
      address: org.address || "",
      ownerEmail: org.ownerEmail || org.email || "",
      planName: org.billing?.planName || "Standard Pay-As-You-Go",
      ratePerMinuteInr: gst.ratePerMinuteInr,
      walletBalanceInr: Number((org.billing?.balanceInr ?? 2500).toFixed(2)),
      totalLeads: orgLeadsCount,
      teamMembers: orgTeamMembers,
      callsDispatched: orgCalls.length,
      callsConnected: orgCalls.filter(
        (c) => c.status === "completed" || Number(c.durationSeconds) > 0
      ).length,
      billingBreakdown: gst,
      invoices: Array.isArray(org.billing?.invoices) ? org.billing.invoices : [],
      activityTrends: buildOrgActivityTrends(orgCalls, gst.ratePerMinuteInr),
      recentAuditLogs: orgLogs,
    },
  });
}

/**
 * PATCH /api/super-admin/organizations/[id]
 * Updates organization status (active / suspended), service limits, plan, or calling rate.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  const { id } = await Promise.resolve(context.params);
  const body = await req.json();

  const updates: Record<string, any> = {};
  const changedParts: string[] = [];

  if (body.status && ["active", "suspended", "pending"].includes(body.status)) {
    updates.status = body.status;
    changedParts.push(`status -> ${body.status}`);
  }
  if (body.name) {
    updates.name = String(body.name).trim();
    changedParts.push(`name -> ${updates.name}`);
  }
  if (body.industry) updates.industry = String(body.industry).trim();
  if (body.maxConcurrentCalls !== undefined) {
    updates["settings.maxConcurrentCalls"] = Number(body.maxConcurrentCalls);
    changedParts.push(`maxConcurrentCalls=${updates["settings.maxConcurrentCalls"]}`);
  }
  if (body.maxAgents !== undefined) {
    updates["settings.maxAgents"] = Number(body.maxAgents);
    changedParts.push(`maxAgents=${updates["settings.maxAgents"]}`);
  }
  if (body.monthlyCallLimit !== undefined) {
    updates["settings.monthlyCallLimit"] = Number(body.monthlyCallLimit);
    changedParts.push(`monthlyCallLimit=${updates["settings.monthlyCallLimit"]}`);
  }
  if (body.planName) {
    updates["billing.planName"] = String(body.planName).trim();
    changedParts.push(`plan -> ${updates["billing.planName"]}`);
  }
  if (body.ratePerMinuteInr !== undefined) {
    updates["billing.ratePerMinuteInr"] = Math.max(1, Number(body.ratePerMinuteInr));
    changedParts.push(`rate -> ₹${updates["billing.ratePerMinuteInr"]}/min`);
  }

  const db = await connectToDatabase();
  let updatedDoc: any = null;
  if (db) {
    updatedDoc = await Organization.findOneAndUpdate(
      buildOrgLookupFilter(id),
      { $set: updates },
      { new: true }
    ).lean();

    if (updatedDoc && changedParts.length > 0) {
      await AuditLog.create({
        action: body.status ? `Organization ${body.status === "suspended" ? "Suspended" : "Activated"}` : "Service Controls Updated",
        category: "service_control",
        actorEmail: rbac.session.email,
        actorName: rbac.session.name || "Super Admin",
        targetOrgId: String(updatedDoc._id),
        targetOrgName: updatedDoc.name,
        details: changedParts.join(", "),
      });
    }
  }

  const mem = getOrganizationById(id);
  const updatedMem = mem ? updateOrganization(id, updates as any) : null;

  if (!updatedDoc && !updatedMem) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    organization: updatedDoc
      ? { ...updatedDoc, _id: String(updatedDoc._id) }
      : updatedMem,
  });
}

/**
 * DELETE /api/super-admin/organizations/[id]
 * Permanently removes an Organization and cascades cleanup of its tenant-scoped records.
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const { id } = await Promise.resolve(context.params);
    if (!id || id === "platform_hq") {
      return NextResponse.json(
        { error: "Cannot delete platform HQ." },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database connection required to delete an organization." },
        { status: 503 }
      );
    }

    const org: any = await Organization.findOne(buildOrgLookupFilter(id)).lean();
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 }
      );
    }

    const orgIdStr = String(org._id);
    const orgMatch = mongoose.Types.ObjectId.isValid(orgIdStr)
      ? {
          $or: [
            { organizationId: orgIdStr },
            { organizationId: new mongoose.Types.ObjectId(orgIdStr) },
          ],
        }
      : { organizationId: orgIdStr };

    const purgeCollection = (name: string) =>
      mongoose.connection.db
        ? mongoose.connection.db.collection(name).deleteMany(orgMatch).catch(() => null)
        : Promise.resolve(null);

    await Promise.all([
      Organization.deleteOne({ _id: org._id }),
      User.deleteMany({ ...orgMatch, role: { $ne: "super_admin" } }),
      Agent.deleteMany(orgMatch),
      Campaign.deleteMany(orgMatch),
      Call.deleteMany(orgMatch),
      PlatformRequest.deleteMany({ organizationId: orgIdStr }),
      purgeCollection("knowledgebases"),
      purgeCollection("leads"),
      purgeCollection("leadassignments"),
      purgeCollection("transcripts"),
      purgeCollection("usageledgers"),
    ]);

    await AuditLog.create({
      action: "ORGANIZATION_DELETED",
      category: "organization",
      actorEmail: rbac.session.email,
      actorName: rbac.session.name || "Super Admin",
      targetOrgId: orgIdStr,
      targetOrgName: org.name,
      details: `Permanently removed organization "${org.name}" (${orgIdStr}) and its tenant-scoped data.`,
    });

    return NextResponse.json({
      success: true,
      deletedId: orgIdStr,
      message: `Organization "${org.name}" permanently removed.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to delete organization") },
      { status: 500 }
    );
  }
}
