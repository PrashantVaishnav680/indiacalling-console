import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import { requireSuperAdminRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import PlatformRequest from "@/models/PlatformRequest";
import { logAuditEvent } from "@/lib/audit";

/**
 * PATCH /api/super-admin/requests/[id]
 * Lets Super Admin approve, mark completed, or reject an Organization's request.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const { id } = await Promise.resolve(context.params);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid request ID." }, { status: 400 });
    }

    const body = await req.json();
    const status = String(body.status || "").toLowerCase();
    if (!["approved", "rejected", "completed"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'approved', 'completed', or 'rejected'." },
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

    existing.status = status;
    existing.resolutionNote = String(body.resolutionNote || "").trim();
    existing.resolvedByEmail = rbac.session.email;
    existing.resolvedAt = new Date();
    await existing.save();

    await logAuditEvent({
      action: `Organization Request ${status.toUpperCase()}`,
      category: "organization",
      actorEmail: rbac.session.email,
      actorName: rbac.session.name || "Platform Super Admin",
      targetOrgId: existing.organizationId,
      targetOrgName: existing.organizationName,
      details: `${existing.title}${existing.resolutionNote ? ` — ${existing.resolutionNote}` : ""}`,
    });

    return NextResponse.json({
      success: true,
      request: { ...existing.toObject(), _id: String(existing._id) },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to update organization request") },
      { status: 500 }
    );
  }
}
