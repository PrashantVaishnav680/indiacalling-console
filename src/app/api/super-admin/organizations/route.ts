import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import {
  requireSuperAdminRole,
  sanitizeOrganizationForSuperAdmin,
} from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import Organization from "@/models/Organization";
import User from "@/models/User";
import Agent from "@/models/Agent";
import Campaign from "@/models/Campaign";
import Call from "@/models/Call";
import {
  getOrganizations,
  addOrganization,
  getAgents,
  getCampaigns,
  getCalls,
} from "@/lib/store";

/**
 * GET /api/super-admin/organizations
 * Returns searchable, filterable Organizations Directory with aggregated metadata ONLY.
 */
export async function GET(req: NextRequest) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") || "").trim().toLowerCase();
  const statusFilter = (searchParams.get("status") || "all").toLowerCase();
  const industryFilter = (searchParams.get("industry") || "all").toLowerCase();

  const db = await connectToDatabase();
  let orgs: any[] = getOrganizations();
  let agents: any[] = getAgents();
  let campaigns: any[] = getCampaigns();
  let calls: any[] = getCalls();
  let users: any[] = [];

  if (db) {
    const [dbOrgs, dbAgents, dbCamps, dbCalls, dbUsers] = await Promise.all([
      Organization.find({}).sort({ createdAt: -1 }).lean(),
      Agent.find({}).select("_id organizationId status").lean(),
      Campaign.find({}).select("_id organizationId status").lean(),
      Call.find({}).select("_id organizationId durationSeconds").lean(),
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

  let directory = orgs.map((org) => {
    const orgIdStr = String(org._id);
    const orgAgents = agents.filter((a) => String(a.organizationId) === orgIdStr);
    const orgActiveAgents = orgAgents.filter((a) => a.status === "active").length;
    const orgCampaigns = campaigns.filter(
      (c) => String(c.organizationId) === orgIdStr
    );
    const orgCalls = calls.filter((c) => String(c.organizationId) === orgIdStr);
    const orgUsers = users.filter((u) => String(u.organizationId) === orgIdStr);

    const secs = orgCalls.reduce(
      (acc, c) => acc + (Number(c.durationSeconds) || 0),
      0
    );
    const mins = Math.ceil(secs / 60);
    const rate = org.billing?.ratePerMinuteInr ?? 6;
    const spendInr = Number((mins * rate).toFixed(2));
    const unbilledInr = Number((org.billing?.unbilledInr ?? spendInr).toFixed(2));
    const dueInr = Number((org.billing?.dueInr ?? 0).toFixed(2));

    return sanitizeOrganizationForSuperAdmin(org, {
      agentCount: orgAgents.length,
      activeAgentCount: orgActiveAgents,
      campaignCount: orgCampaigns.length,
      totalCalls: orgCalls.length,
      totalMinutes: mins,
      totalSpendInr: spendInr,
      unbilledSpendInr: unbilledInr,
      dueAmountInr: dueInr,
      teamMemberCount: Math.max(orgUsers.length, 1),
    });
  });

  if (statusFilter !== "all") {
    directory = directory.filter((o) => o.status === statusFilter);
  }
  if (industryFilter !== "all") {
    directory = directory.filter(
      (o) => o.industry.toLowerCase() === industryFilter
    );
  }
  if (search) {
    directory = directory.filter(
      (o) =>
        o.name.toLowerCase().includes(search) ||
        o.slug.toLowerCase().includes(search) ||
        o.email.toLowerCase().includes(search) ||
        o._id.toLowerCase().includes(search)
    );
  }

  const industries = Array.from(
    new Set(orgs.map((o) => o.industry || "General Business"))
  ).sort();

  return NextResponse.json({
    privacyMode: "zero_pii_enforced",
    organizations: directory,
    industries,
  });
}

/**
 * POST /api/super-admin/organizations
 * Provisions a new isolated Organization tenant and its initial `organization` owner account.
 */
export async function POST(req: NextRequest) {
  try {
    const rbac = requireSuperAdminRole(req);
    if (!rbac.ok) return rbac.response;

    const body = await req.json();
    const name = String(body.name || "").trim();
    const industry = String(body.industry || "General Business").trim();
    const ownerName = String(body.ownerName || "").trim();
    const ownerEmail = String(body.ownerEmail || body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    const phone = String(body.phone || "").trim();

    if (name.length < 2) {
      return NextResponse.json(
        { error: "Organization name is required (min 2 characters)." },
        { status: 400 }
      );
    }
    if (!ownerEmail.includes("@")) {
      return NextResponse.json(
        { error: "A valid owner email address is required." },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Initial password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    if (db) {
      const exists = await User.findOne({ email: ownerEmail }).lean();
      if (exists) {
        return NextResponse.json(
          { error: "A user with this email already exists." },
          { status: 409 }
        );
      }
    }

    const orgId = new mongoose.Types.ObjectId().toHexString();
    const userId = new mongoose.Types.ObjectId().toHexString();
    const slug = `${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)}-${Math.random().toString(36).slice(2, 6)}`;

    const newOrg = {
      _id: orgId,
      name,
      slug,
      email: ownerEmail,
      phone,
      industry,
      ownerName: ownerName || name,
      ownerEmail,
      ownerPhone: phone,
      status: "active" as const,
      settings: {
        callingHours: { start: "09:30", end: "18:30", timezone: "Asia/Kolkata" },
        maxConcurrentCalls: Number(body.maxConcurrentCalls || 10),
        maxAgents: Number(body.maxAgents || 25),
        monthlyCallLimit: Number(body.monthlyCallLimit || 10000),
        defaultLanguage: "English + Hindi",
      },
      billing: {
        planName: body.planName || "Growth Pay-As-You-Go",
        balanceInr: Number(body.initialBalanceInr ?? 1000),
        ratePerMinuteInr: 6,
        unbilledInr: 0,
        dueInr: 0,
        invoices: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const hashedPassword = await bcrypt.hash(password, 10);

    if (db) {
      await Organization.create({
        ...newOrg,
        _id: new mongoose.Types.ObjectId(orgId),
      });
      await User.create({
        _id: new mongoose.Types.ObjectId(userId),
        name: ownerName || `${name} Admin`,
        email: ownerEmail,
        password: hashedPassword,
        role: "organization",
        organizationId: orgId,
        title: "Organization Owner",
        isActive: true,
      });
    }

    addOrganization(newOrg);

    return NextResponse.json(
      {
        success: true,
        organization: sanitizeOrganizationForSuperAdmin(newOrg, {
          agentCount: 0,
          activeAgentCount: 0,
          campaignCount: 0,
          totalCalls: 0,
          totalMinutes: 0,
          totalSpendInr: 0,
          unbilledSpendInr: 0,
          dueAmountInr: 0,
          teamMemberCount: 1,
        }),
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to provision organization") },
      { status: 500 }
    );
  }
}
