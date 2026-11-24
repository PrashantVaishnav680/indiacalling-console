import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import { requireOrganizationRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import PlatformRequest from "@/models/PlatformRequest";
import Organization from "@/models/Organization";
import { logAuditEvent } from "@/lib/audit";

/**
 * PATCH /api/requests/[id]
 * Allows an Organization to approve or reject an incoming Super Admin request
 * (e.g., Managed Service Access request). Approving automatically grants Managed Service Access.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const { id } = await Promise.resolve(context.params);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid request ID." }, { status: 400 });
    }

    const body = await req.json();
    const decision = String(body.status || "").toLowerCase();
    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json(
        { error: "Status must be 'approved' or 'rejected'." },
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

    const existing: any = await PlatformRequest.findById(id);
    if (!existing) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    if (String(existing.organizationId) !== String(rbac.organizationId)) {
      return NextResponse.json(
        { error: "Cross-Tenant Access Denied" },
        { status: 403 }
      );
    }

    if (existing.direction !== "admin_to_org") {
      return NextResponse.json(
        { error: "Only incoming Super Admin requests can be approved or rejected by the Organization." },
        { status: 400 }
      );
    }

    existing.status = decision;
    existing.resolutionNote = String(body.resolutionNote || "").trim();
    existing.resolvedByEmail = rbac.session.email;
    existing.resolvedAt = new Date();
    await existing.save();

    // Auto-grant Managed Service Access when the org approves an access request
    if (existing.type === "managed_access_request" && decision === "approved") {
      const orgFilter = mongoose.Types.ObjectId.isValid(rbac.organizationId)
        ? { _id: new mongoose.Types.ObjectId(rbac.organizationId) }
        : { $or: [{ _id: rbac.organizationId }, { slug: rbac.organizationId }] };

      await Organization.findOneAndUpdate(orgFilter, {
        $set: {
          managedServiceAccess: {
            enabled: true,
            grantedAt: new Date(),
            grantedBy: rbac.session.email,
            planLabel: "Managed Service Plan",
          },
        },
      });
    }

    await logAuditEvent({
      action:
        existing.type === "managed_access_request"
          ? decision === "approved"
            ? "MANAGED_ACCESS_APPROVED"
            : "MANAGED_ACCESS_REJECTED"
          : `Incoming Request ${decision.toUpperCase()}`,
      category: "security",
      actorEmail: rbac.session.email,
      actorName: rbac.session.name || "Organization Admin",
      targetOrgId: rbac.organizationId,
      targetOrgName: existing.organizationName,
      details: `${existing.title} — ${decision}${existing.resolutionNote ? `: ${existing.resolutionNote}` : ""}`,
    });

    return NextResponse.json({
      success: true,
      request: { ...existing.toObject(), _id: String(existing._id) },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to update request") },
      { status: 500 }
    );
  }
}
