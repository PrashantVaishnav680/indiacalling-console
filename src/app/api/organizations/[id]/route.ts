import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import {
  getSessionFromRequest,
  isAuthorizedRole,
  normalizeUserRole,
  DEV_DEMO_ACCOUNTS,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import Organization from "@/models/Organization";
import User from "@/models/User";
import Agent from "@/models/Agent";
import Campaign from "@/models/Campaign";
import Lead from "@/models/Lead";
import Call from "@/models/Call";
import KnowledgeBase from "@/models/KnowledgeBase";
import UsageLedger from "@/models/UsageLedger";
import {
  getOrganizationById,
  updateOrganization,
  addOrganization,
  getAgents,
  getCampaigns,
  getLeads,
  getCalls,
  getKnowledgeBases,
} from "@/lib/store";
import { bolnaService } from "@/lib/bolna/client";

function getInMemoryUsers() {
  if (!(global as any).__INDIACALLING_TEAM_USERS__) {
    (global as any).__INDIACALLING_TEAM_USERS__ = DEV_DEMO_ACCOUNTS.map(
      ({ password, ...u }) => ({
        _id: u.userId,
        name: u.name,
        email: u.email,
        role: u.role,
        organizationId: u.organizationId,
        isActive: true,
      })
    );
  }
  return (global as any).__INDIACALLING_TEAM_USERS__ as any[];
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = await Promise.resolve(context.params);
  const id = resolvedParams.id;
  const isSuper = isAuthorizedRole(session.role, ["super_admin"]);

  if (!isSuper && String(session.organizationId) !== String(id)) {
    return NextResponse.json(
      {
        error: "Forbidden",
        details: "You cannot view another organization's details.",
      },
      { status: 403 }
    );
  }

  const db = await connectToDatabase();
  let org: any = getOrganizationById(id);

  if (db) {
    const filter = mongoose.Types.ObjectId.isValid(id)
      ? {
          $or: [
            { _id: id },
            { _id: new mongoose.Types.ObjectId(id) },
            { slug: id },
          ],
        }
      : { $or: [{ _id: id }, { slug: id }] };
    const dbOrg: any = await Organization.findOne(filter).lean();
    if (dbOrg) {
      org = { ...dbOrg, _id: String(dbOrg._id) };
      addOrganization(org);
    }
  }

  if (!org) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 }
    );
  }

  const orgIdStr = String(org._id);
  const period = req.nextUrl.searchParams.get("period") || "All";
  const now = new Date();
  let cutoffTimestamp = 0;
  if (period === "Today") {
    cutoffTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  } else if (period === "7D") {
    cutoffTimestamp = Date.now() - 7 * 24 * 60 * 60 * 1000;
  } else if (period === "30D") {
    cutoffTimestamp = Date.now() - 30 * 24 * 60 * 60 * 1000;
  }

  let users = getInMemoryUsers().filter(
    (u) =>
      String(u.organizationId) === orgIdStr ||
      (orgIdStr === "org_default_01" &&
        (!u.organizationId || u.organizationId === "org_default_01"))
  );
  let agents = getAgents().filter(
    (a) => String(a.organizationId) === orgIdStr
  );
  let campaigns = getCampaigns().filter(
    (c) => String(c.organizationId) === orgIdStr
  );
  let leads = getLeads().filter(
    (l) => String(l.organizationId) === orgIdStr
  );
  let calls = getCalls().filter(
    (c) => String(c.organizationId) === orgIdStr
  );
  let knowledgeBases = getKnowledgeBases().filter(
    (kb) => String(kb.organizationId) === orgIdStr
  );
  let usageLedgers: any[] = [];

  if (db) {
    try {
      const [dbUsers, dbAgents, dbCamps, dbLeads, dbCalls, dbKBs, dbLedgers] = await Promise.all([
        User.find(
          orgIdStr === "org_default_01"
            ? {
                $or: [
                  { organizationId: orgIdStr },
                  { organizationId: null },
                  { organizationId: { $exists: false } },
                ],
              }
            : { organizationId: orgIdStr }
        )
          .select("-password")
          .lean(),
        Agent.find({ organizationId: orgIdStr }).lean(),
        Campaign.find({ organizationId: orgIdStr }).lean(),
        Lead.find({ organizationId: orgIdStr }).lean(),
        Call.find({ organizationId: orgIdStr }).lean(),
        KnowledgeBase.find({ organizationId: orgIdStr }).lean(),
        UsageLedger.find({ organizationId: orgIdStr }).lean(),
      ]);
      if (dbUsers.length > 0) {
        users = dbUsers.map((u: any) => ({
          ...u,
          _id: String(u._id),
          role: normalizeUserRole(u.role),
        }));
      }
      if (dbAgents.length > 0) {
        agents = dbAgents.map((a: any) => ({ ...a, _id: String(a._id) }));
      }
      if (dbCamps.length > 0) {
        campaigns = dbCamps.map((c: any) => ({ ...c, _id: String(c._id) }));
      }
      if (dbLeads.length > 0) {
        leads = dbLeads.map((l: any) => ({ ...l, _id: String(l._id) }));
      }
      if (dbCalls.length > 0) {
        calls = dbCalls.map((c: any) => ({ ...c, _id: String(c._id) }));
      }
      if (dbKBs.length > 0) {
        knowledgeBases = dbKBs.map((kb: any) => ({ ...kb, _id: String(kb._id) }));
      }
      if (dbLedgers.length > 0) {
        usageLedgers = dbLedgers;
      }
    } catch {
      // Fallback to store
    }
  }

  // Filter calls by reporting period for billing section
  const periodCalls =
    cutoffTimestamp > 0
      ? calls.filter((c) => {
          const t = new Date(c.startedAt || c.createdAt).getTime();
          return !isNaN(t) && t >= cutoffTimestamp;
        })
      : calls;

  const totalCallDurationSeconds = periodCalls.reduce(
    (acc, c) => acc + (c.durationSeconds || 0),
    0
  );
  const totalMinutes = Math.ceil(totalCallDurationSeconds / 60);
  const totalCostInr = Number((totalMinutes * 6).toFixed(2));
  const completedCalls = periodCalls.filter((c) => c.status === "completed").length;
  const failedCalls = periodCalls.filter(
    (c) => c.status === "failed" || c.status === "busy" || c.status === "no_answer"
  ).length;
  const qualifiedLeads = leads.filter(
    (l) => l.qualificationStatus === "qualified"
  ).length;
  const primaryAdmin =
    users.find((u) => normalizeUserRole(u.role) === "organization") || users[0];

  return NextResponse.json({
    organization: {
      ...org,
      status: org.status === "inactive" ? "suspended" : org.status || "active",
      adminName: org.ownerName || primaryAdmin?.name || "Organization Admin",
      adminEmail: org.ownerEmail || primaryAdmin?.email || org.email,
    },
    administrator: primaryAdmin
      ? {
          _id: String(primaryAdmin._id),
          name: primaryAdmin.name,
          email: primaryAdmin.email,
          role: primaryAdmin.role || "organization",
          isActive: primaryAdmin.isActive !== false,
        }
      : {
          _id: "admin_default",
          name: org.ownerName || "Organization Admin",
          email: org.ownerEmail || org.email,
          role: "organization",
          isActive: true,
        },
    // Zero-PII Privacy Isolation: Super Admin receives ONLY aggregated metadata/counts, never private org records
    users: isSuper ? [] : users,
    agents: isSuper ? [] : agents,
    campaigns: isSuper ? [] : campaigns,
    leads: isSuper ? [] : leads,
    calls: isSuper ? [] : calls,
    knowledgeBases: isSuper ? [] : knowledgeBases,
    privacyIsolated: isSuper,
    usageStatistics: {
      totalUsers: users.length,
      totalAgents: agents.length,
      syncedAgents: agents.filter((a) => a.syncStatus === "synced").length,
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter((c) => c.status === "running").length,
      totalLeads: leads.length,
      qualifiedLeads,
      totalCalls: calls.length,
      periodTotalCalls: periodCalls.length,
      completedCalls,
      failedCalls,
      totalCallDurationSeconds,
      totalMinutes,
      totalCostInr,
      actualBilledCostInr: totalCostInr,
      estimatedSpendInr: Number(
        (campaigns.reduce((acc, c) => acc + (c.totalLeads || 0) * 1.5 * 6, 0)).toFixed(2)
      ),
      reportingPeriod: period,
      ledgerEntriesCount: usageLedgers.length,
    },
    integrationStatus: {
      bolnaConfigured: bolnaService.hasValidApiKey && !bolnaService.isMockMode,
      bolnaStatus:
        bolnaService.hasValidApiKey && !bolnaService.isMockMode
          ? "Connected (Live v2 API)"
          : bolnaService.isMockMode
          ? "Standby (API Key Not Set)"
          : "Configuration Required",
      bolnaBaseUrl: bolnaService.baseUrl,
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY &&
          !process.env.GEMINI_API_KEY.includes("your_google")
      ),
      geminiStatus: Boolean(
        process.env.GEMINI_API_KEY &&
          !process.env.GEMINI_API_KEY.includes("your_google")
      )
        ? "Free Tier Ready"
        : "Configuration Required",
      mongodbConnected: Boolean(db),
      knowledgeBaseCount: knowledgeBases.length,
      lastCheckedAt: new Date().toISOString(),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = await Promise.resolve(context.params);
  const id = resolvedParams.id;
  const isSuper = isAuthorizedRole(session.role, ["super_admin"]);
  const isOrgUser = isAuthorizedRole(session.role, ["organization"]);

  if (!isSuper && !(isOrgUser && String(session.organizationId) === String(id))) {
    return NextResponse.json(
      {
        error: "Forbidden",
        details: "You do not have permission to modify this organization.",
      },
      { status: 403 }
    );
  }

  const body = await req.json();
  // Only SUPER_ADMIN can suspend or activate organizations
  if (body.status !== undefined && !isSuper) {
    return NextResponse.json(
      {
        error: "Forbidden",
        details: "Only SUPER_ADMIN can change organization activation status.",
      },
      { status: 403 }
    );
  }

  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.email !== undefined)
    updates.email = String(body.email).trim().toLowerCase();
  if (body.phone !== undefined) updates.phone = String(body.phone).trim();
  if (body.address !== undefined) updates.address = String(body.address).trim();
  if (body.industry !== undefined)
    updates.industry = String(body.industry).trim();
  if (body.ownerName !== undefined)
    updates.ownerName = String(body.ownerName).trim();
  if (body.ownerEmail !== undefined)
    updates.ownerEmail = String(body.ownerEmail).trim().toLowerCase();
  if (body.adminName !== undefined)
    updates.ownerName = String(body.adminName).trim();
  if (body.adminEmail !== undefined)
    updates.ownerEmail = String(body.adminEmail).trim().toLowerCase();
  if (body.status !== undefined && isSuper) {
    updates.status = body.status;
  }
  if (body.settings !== undefined) {
    updates.settings = body.settings;
  }

  const db = await connectToDatabase();
  let updatedMongoDoc: any = null;
  if (db) {
    const patchFilter = mongoose.Types.ObjectId.isValid(id)
      ? {
          $or: [
            { _id: id },
            { _id: new mongoose.Types.ObjectId(id) },
            { slug: id },
            { slug: "indiacalling-org" },
          ],
        }
      : { $or: [{ _id: id }, { slug: id }, { slug: "indiacalling-org" }] };
    updatedMongoDoc = await Organization.findOneAndUpdate(
      patchFilter,
      { $set: updates },
      { new: true }
    ).lean();

    // Persist Primary Administrator updates in MongoDB User collection
    if (
      body.adminName !== undefined ||
      body.adminEmail !== undefined ||
      body.adminActive !== undefined
    ) {
      const userUpdates: Record<string, any> = {};
      if (body.adminName !== undefined) {
        userUpdates.name = String(body.adminName).trim();
      }
      if (body.adminEmail !== undefined) {
        userUpdates.email = String(body.adminEmail).trim().toLowerCase();
      }
      if (body.adminActive !== undefined) {
        userUpdates.isActive = Boolean(body.adminActive);
      }

      const orgIdStr = String(id);
      await User.findOneAndUpdate(
        {
          $or: [
            { organizationId: orgIdStr, role: "organization" },
            { email: updates.ownerEmail || body.adminEmail },
          ],
        },
        { $set: userUpdates }
      );
    }
  }

  const updated = updateOrganization(id, updates);
  return NextResponse.json({
    success: true,
    organization: updatedMongoDoc
      ? { ...updatedMongoDoc, _id: String(updatedMongoDoc._id) }
      : updated,
  });
}
