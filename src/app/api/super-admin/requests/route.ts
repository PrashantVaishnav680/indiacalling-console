import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import { requireSuperAdminRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import PlatformRequest from "@/models/PlatformRequest";
import Organization from "@/models/Organization";
import { logAuditEvent } from "@/lib/audit";

/**
 * GET /api/super-admin/requests
 * Unified Super Admin Requests Inbox:
 * - All PlatformRequest items (Org -> Admin & Admin -> Org)
 * - Pending UPI/wallet wallet top-up count across all organizations
 */
export async function GET(req: NextRequest) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const db = await connectToDatabase();
    let requests: any[] = [];
    let pendingTopupCount = 0;

    if (db) {
      const [docs, orgs] = await Promise.all([
        PlatformRequest.find({}).sort({ createdAt: -1 }).limit(150).lean(),
        Organization.find({}).select("billing.invoices").lean(),
      ]);

      requests = docs.map((d: any) => ({ ...d, _id: String(d._id) }));

      for (const o of orgs as any[]) {
        const invoices = Array.isArray(o?.billing?.invoices) ? o.billing.invoices : [];
        pendingTopupCount += invoices.filter(
          (inv: any) => inv.type === "topup" && inv.status === "pending"
        ).length;
      }
    }

    return NextResponse.json({
      privacyMode: "zero_pii_enforced",
      requests,
      counts: {
        incomingPending: requests.filter(
          (r) => r.direction === "org_to_admin" && r.status === "pending"
        ).length,
        outgoingPending: requests.filter(
          (r) => r.direction === "admin_to_org" && r.status === "pending"
        ).length,
        pendingTopupCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to load platform requests") },
      { status: 500 }
    );
  }
}

/**
 * POST /api/super-admin/requests
 * Lets Super Admin send a Managed Service Access request to a specific Organization.
 * Appears immediately in that Organization's Requests inbox for 1-click approval.
 */
export async function POST(req: NextRequest) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const body = await req.json();
    const organizationId = String(body.organizationId || "").trim();
    const reason = String(body.details || body.reason || "").trim();

    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required." },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database connection required." },
        { status: 503 }
      );
    }

    const filter = mongoose.Types.ObjectId.isValid(organizationId)
      ? { _id: new mongoose.Types.ObjectId(organizationId) }
      : { $or: [{ _id: organizationId }, { slug: organizationId }] };

    const org: any = await Organization.findOne(filter).select("_id name").lean();
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 }
      );
    }

    const targetOrgId = String(org._id);
    const created = await PlatformRequest.create({
      organizationId: targetOrgId,
      organizationName: org.name,
      type: "managed_access_request",
      direction: "admin_to_org",
      title: String(body.title || "Managed Service Support Access Request").trim(),
      details:
        reason ||
        "IndiaCalling Platform Super Admin is requesting temporary Managed Service Support Access to help configure your workspace.",
      requestedByEmail: rbac.session.email,
      requestedByName: rbac.session.name || "Platform Super Admin",
      status: "pending",
    });

    await logAuditEvent({
      action: "MANAGED_ACCESS_REQUESTED",
      category: "security",
      actorEmail: rbac.session.email,
      actorName: rbac.session.name || "Platform Super Admin",
      targetOrgId,
      targetOrgName: org.name,
      details: created.details,
    });

    return NextResponse.json(
      {
        success: true,
        request: { ...created.toObject(), _id: String(created._id) },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to send access request") },
      { status: 500 }
    );
  }
}
