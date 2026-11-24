import Call from "@/models/Call";
import { requireOrganizationRole } from "@/lib/rbac";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSessionFromRequest, isAuthorizedRole } from "@/lib/auth";
import {
  getLeadById,
  updateLead,
  deleteLead,
  addAssignment,
} from "@/lib/store";
import { connectToDatabase } from "@/lib/db";
import Lead from "@/models/Lead";

async function resolveLead(id: string) {
  const db = await connectToDatabase();
  if (db && mongoose.Types.ObjectId.isValid(id)) {
    const doc = await Lead.findById(id).lean();
    if (doc) return { ...(doc as any), _id: String((doc as any)._id) };
  }
  return getLeadById(id) || null;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const { id } = await Promise.resolve(context.params);
  const lead = await resolveLead(id);
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (String(lead.organizationId) !== String(rbac.organizationId)) {
    return NextResponse.json(
      { error: "Forbidden", details: "Cross-organization lead access is blocked." },
      { status: 403 }
    );
  }

  const db = await connectToDatabase();
  let calls: any[] = [];
  if (db) {
    const dbCalls = await Call.find({
      organizationId: lead.organizationId,
      $or: [{ leadId: String(lead._id) }, { phoneNumber: lead.phone }],
    })
      .sort({ startedAt: -1, createdAt: -1 })
      .lean();
    calls = dbCalls.map((c: any) => ({ ...c, _id: String(c._id) }));
  }
  return NextResponse.json({ lead, calls });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const session = rbac.session;
  const { id } = await Promise.resolve(context.params);
  const existing = await resolveLead(id);
  if (!existing) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (String(existing.organizationId) !== String(rbac.organizationId)) {
    return NextResponse.json(
      { error: "Forbidden", details: "Cannot modify a lead belonging to another organization." },
      { status: 403 }
    );
  }

  const body = await req.json();
  const safeUpdates: Record<string, any> = {};

  if (body.name !== undefined) safeUpdates.name = String(body.name).trim();
  if (body.company !== undefined) safeUpdates.company = String(body.company).trim();
  if (body.email !== undefined) safeUpdates.email = String(body.email).trim();
  if (body.qualificationStatus !== undefined)
    safeUpdates.qualificationStatus = body.qualificationStatus;
  if (body.interestLevel !== undefined)
    safeUpdates.interestLevel = body.interestLevel;
  if (body.qualificationScore !== undefined)
    safeUpdates.qualificationScore = Number(body.qualificationScore);
  if (body.assignedSalespersonId !== undefined)
    safeUpdates.assignedSalespersonId = body.assignedSalespersonId;
  if (body.assignedSalespersonName !== undefined)
    safeUpdates.assignedSalespersonName = body.assignedSalespersonName;
  if (body.followUpAt !== undefined) safeUpdates.followUpAt = body.followUpAt;
  if (body.scheduledCall !== undefined) safeUpdates.scheduledCall = body.scheduledCall;
  if (body.notes !== undefined) {
    safeUpdates.notes = Array.isArray(body.notes)
      ? body.notes
      : [...(existing.notes || []), String(body.notes)];
  }
  safeUpdates.updatedAt = new Date();

  const db = await connectToDatabase();
  if (db && mongoose.Types.ObjectId.isValid(id)) {
    await Lead.findByIdAndUpdate(id, { $set: safeUpdates });
  }

  const updated = updateLead(id, safeUpdates) || {
    ...existing,
    ...safeUpdates,
  };

  if (body.assignedSalespersonName && updated) {
    addAssignment({
      _id: `assign_${Date.now()}`,
      organizationId: updated.organizationId,
      leadId: updated._id,
      leadName: `${updated.name} (${updated.company || "Direct"})`,
      salespersonId: body.assignedSalespersonId || `user_sales_${Date.now()}`,
      salespersonName: body.assignedSalespersonName,
      assignedBy: session.name || "Organization Admin",
      assignmentMethod: "manual",
      status: "accepted",
      assignedAt: new Date(),
      acceptedAt: new Date(),
      notes:
        (typeof body.notes === "string" ? body.notes : "") ||
        "Lead assigned to salesperson.",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return NextResponse.json({ success: true, updated });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const session = getSessionFromRequest(req);
  if (!session || !isAuthorizedRole(session.role, ["organization"])) {
    return NextResponse.json(
      { error: "Forbidden", details: "Only organization members can delete lead records." },
      { status: 403 }
    );
  }

  const { id } = await Promise.resolve(context.params);
  const existing = await resolveLead(id);
  if (!existing) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (String(existing.organizationId) !== String(rbac.organizationId)) {
    return NextResponse.json(
      { error: "Forbidden", details: "Cannot delete a lead belonging to another organization." },
      { status: 403 }
    );
  }

  const db = await connectToDatabase();
  if (db && mongoose.Types.ObjectId.isValid(id)) {
    await Lead.findByIdAndDelete(id);
  }
  deleteLead(id);

  return NextResponse.json({ success: true, deletedId: id });
}
