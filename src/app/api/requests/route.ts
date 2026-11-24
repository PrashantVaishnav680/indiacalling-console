import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import { requireOrganizationRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import PlatformRequest from "@/models/PlatformRequest";
import Organization from "@/models/Organization";
import { logAuditEvent } from "@/lib/audit";

/**
 * GET /api/requests
 * Returns all incoming (Super Admin -> Org) and outgoing (Org -> Super Admin) requests
 * strictly scoped to the authenticated Organization, plus recent wallet wallet top-up requests.
 */
export async function GET(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const db = await connectToDatabase();
    const orgId = rbac.organizationId;

    let requests: any[] = [];
    let pendingTopups: any[] = [];

    if (db) {
      const [docs, orgDoc] = await Promise.all([
        PlatformRequest.find({ organizationId: orgId })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean(),
        Organization.findOne(
          mongoose.Types.ObjectId.isValid(orgId)
            ? { _id: new mongoose.Types.ObjectId(orgId) }
            : { $or: [{ _id: orgId }, { slug: orgId }] }
        )
          .select("name billing.invoices")
          .lean(),
      ]);

      requests = docs.map((d: any) => ({ ...d, _id: String(d._id) }));

      const invoices = Array.isArray((orgDoc as any)?.billing?.invoices)
        ? (orgDoc as any).billing.invoices
        : [];
      pendingTopups = invoices
        .filter((inv: any) => inv.type === "topup")
        .slice(0, 15);
    }

    return NextResponse.json({
      requests,
      topupRequests: pendingTopups,
      counts: {
        incomingPending: requests.filter(
          (r) => r.direction === "admin_to_org" && r.status === "pending"
        ).length,
        outgoingPending: requests.filter(
          (r) => r.direction === "org_to_admin" && r.status === "pending"
        ).length,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to load organization requests") },
      { status: 500 }
    );
  }
}

/**
 * POST /api/requests
 * Allows an Organization to submit a new request to Platform Super Admin
 * (Custom Enterprise Quote, Quota Increase, or Support Request).
 */
export async function POST(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const body = await req.json();
    const type = String(body.type || "support_request");
    const allowedTypes = ["enterprise_quote", "quota_increase", "support_request"];
    if (!allowedTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid request type." },
        { status: 400 }
      );
    }

    const title = String(body.title || "").trim();
    const details = String(body.details || "").trim();
    if (title.length < 3) {
      return NextResponse.json(
        { error: "Please provide a clear title (at least 3 characters)." },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database connection required to submit requests." },
        { status: 503 }
      );
    }

    const orgId = rbac.organizationId;
    const orgDoc: any = await Organization.findOne(
      mongoose.Types.ObjectId.isValid(orgId)
        ? { _id: new mongoose.Types.ObjectId(orgId) }
        : { $or: [{ _id: orgId }, { slug: orgId }] }
    )
      .select("name")
      .lean();

    const orgName = orgDoc?.name || rbac.session.workspaceName || "Organization";

    const created = await PlatformRequest.create({
      organizationId: orgId,
      organizationName: orgName,
      type,
      direction: "org_to_admin",
      title,
      details,
      requestedByEmail: rbac.session.email,
      requestedByName: rbac.session.name || "Organization Admin",
      status: "pending",
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });

    await logAuditEvent({
      action: `Organization Request Submitted (${type})`,
      category: "organization",
      actorEmail: rbac.session.email,
      actorName: rbac.session.name || "Organization Admin",
      targetOrgId: orgId,
      targetOrgName: orgName,
      details: `${title}${details ? ` — ${details.slice(0, 180)}` : ""}`,
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
      { error: formatErrorMessage(err, 500, "Failed to submit request") },
      { status: 500 }
    );
  }
}
