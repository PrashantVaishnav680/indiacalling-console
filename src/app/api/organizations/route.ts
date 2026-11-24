import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
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
import {
  getOrganizations,
  addOrganization,
  getAgents,
  getCampaigns,
  getLeads,
  getCalls,
} from "@/lib/store";

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

/**
 * GET /api/organizations
 * SUPER_ADMIN: Returns all client organizations with real aggregated counts + platform overview metrics.
 * CLIENT_ADMIN: Returns only their own organization (strict tenant isolation).
 */
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await connectToDatabase();
  const isSuper = isAuthorizedRole(session.role, ["super_admin"]);

  let allUsers: any[] = getInMemoryUsers();
  let allAgents = getAgents();
  let allCampaigns = getCampaigns();
  let allLeads = getLeads();
  let allCalls = getCalls();

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

      for (const o of dbOrgs) {
        addOrganization({ ...(o as any), _id: String((o as any)._id) });
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
      // Fallback to store if query fails
    }
  }

  const rawOrgs = getOrganizations();
  const visibleOrgs = isSuper
    ? rawOrgs
    : rawOrgs.filter(
        (o) =>
          String(o._id) === String(session.organizationId) ||
          o.slug === session.organizationId
      );

  const enrichedOrganizations = visibleOrgs.map((org) => {
    const orgIdStr = String(org._id);
    const orgUsers = allUsers.filter(
      (u) =>
        String(u.organizationId) === orgIdStr ||
        (orgIdStr === "org_default_01" &&
          (!u.organizationId || u.organizationId === "org_default_01"))
    );
    const primaryAdmin =
      orgUsers.find((u) => normalizeUserRole(u.role) === "organization") ||
      orgUsers.find((u) => normalizeUserRole(u.role) !== "super_admin") ||
      orgUsers[0];
    const orgAgents = allAgents.filter(
      (a) => String(a.organizationId) === orgIdStr
    );
    const orgCampaigns = allCampaigns.filter(
      (c) => String(c.organizationId) === orgIdStr
    );
    const orgLeads = allLeads.filter(
      (l) => String(l.organizationId) === orgIdStr
    );
    const orgCalls = allCalls.filter(
      (c) => String(c.organizationId) === orgIdStr
    );

    const normalizedStatus =
      org.status === "inactive" ? "suspended" : org.status || "active";

    return {
      ...org,
      status: normalizedStatus,
      adminName:
        org.ownerName ||
        primaryAdmin?.name ||
        `${org.name} Client Admin`,
      adminEmail: org.ownerEmail || primaryAdmin?.email || org.email,
      totalUsers: orgUsers.length,
      totalAgents: orgAgents.length,
      totalCampaigns: orgCampaigns.length,
      totalLeads: orgLeads.length,
      totalCalls: orgCalls.length,
    };
  });

  const platformMetrics = isSuper
    ? {
        totalOrganizations: enrichedOrganizations.length,
        activeOrganizations: enrichedOrganizations.filter(
          (o) => o.status === "active"
        ).length,
        suspendedOrganizations: enrichedOrganizations.filter(
          (o) => o.status === "suspended"
        ).length,
        pendingOrganizations: enrichedOrganizations.filter(
          (o) => o.status === "pending"
        ).length,
        totalUsers: allUsers.length,
        totalAgents: allAgents.length,
        totalCampaigns: allCampaigns.length,
        totalLeads: allLeads.length,
        totalCalls: allCalls.length,
      }
    : undefined;

  return NextResponse.json({
    organizations: enrichedOrganizations,
    platformMetrics,
  });
}

/**
 * POST /api/organizations
 * Controlled strictly by SUPER_ADMIN:
 * Creates a new Business Organization AND provisions its initial CLIENT_ADMIN account.
 */
export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session || !isAuthorizedRole(session.role, ["super_admin"])) {
      return NextResponse.json(
        {
          error: "Forbidden",
          details:
            "Only SUPER_ADMIN can onboard and provision new business organizations.",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      businessName,
      name,
      industry,
      contactEmail,
      email,
      contactPhone,
      phone,
      address,
      ownerName,
      ownerEmail,
      adminName,
      adminEmail,
      adminPassword,
      status,
    } = body;

    const resolvedName = String(businessName || name || "").trim();
    const resolvedAdminEmail = String(
      adminEmail || ownerEmail || contactEmail || email || ""
    )
      .trim()
      .toLowerCase();
    const resolvedPassword = String(adminPassword || "Demo@1234");

    if (!resolvedName || !resolvedAdminEmail) {
      return NextResponse.json(
        {
          error: "Validation Error",
          details:
            "Organization name and primary Client Admin email are required.",
        },
        { status: 400 }
      );
    }

    const orgObjectId = new mongoose.Types.ObjectId();
    const slug = `${resolvedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36).slice(-4)}`;

    const newOrg = {
      _id: orgObjectId.toHexString(),
      name: resolvedName,
      slug,
      email: String(contactEmail || email || resolvedAdminEmail)
        .trim()
        .toLowerCase(),
      phone: String(contactPhone || phone || "").trim(),
      address: String(address || "India").trim(),
      industry: String(industry || "General Business").trim(),
      ownerName: String(
        ownerName || adminName || `${resolvedName} Admin`
      ).trim(),
      ownerEmail: resolvedAdminEmail,
      status: (status === "pending" || status === "suspended"
        ? status
        : "active") as "active" | "suspended" | "pending",
      settings: {
        callingHours: {
          start: "09:30",
          end: "18:30",
          timezone: "Asia/Kolkata",
        },
        maxConcurrentCalls: 10,
        defaultLanguage: "English + Hindi",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const hashedPassword = await bcrypt.hash(resolvedPassword, 10);
    const clientAdminUser = {
      _id: new mongoose.Types.ObjectId().toHexString(),
      name: String(
        adminName || ownerName || `${resolvedName} Client Admin`
      ).trim(),
      email: resolvedAdminEmail,
      role: "client_admin" as const,
      organizationId: orgObjectId.toHexString(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = await connectToDatabase();
    if (db) {
      await Organization.create({
        ...newOrg,
        _id: orgObjectId,
      });
      await User.findOneAndUpdate(
        { email: resolvedAdminEmail },
        {
          $setOnInsert: {
            ...clientAdminUser,
            _id: new mongoose.Types.ObjectId(clientAdminUser._id),
            password: hashedPassword,
            organizationId: orgObjectId.toHexString(),
          },
        },
        { upsert: true }
      );
    }

    addOrganization(newOrg);
    getInMemoryUsers().unshift(clientAdminUser);

    return NextResponse.json(
      {
        success: true,
        organization: {
          ...newOrg,
          adminName: clientAdminUser.name,
          adminEmail: clientAdminUser.email,
          totalUsers: 1,
          totalAgents: 0,
          totalCampaigns: 0,
          totalCalls: 0,
        },
        initialClientAdmin: clientAdminUser,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to onboard organization",
        details: error?.message || "Unexpected error",
      },
      { status: 500 }
    );
  }
}
