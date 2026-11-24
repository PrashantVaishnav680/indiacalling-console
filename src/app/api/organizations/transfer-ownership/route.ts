import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import { requireOrganizationRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import Organization from "@/models/Organization";
import User from "@/models/User";
import { logAuditEvent } from "@/lib/audit";

/**
 * POST /api/organizations/transfer-ownership
 * Safe 2-step process to transfer Organization Owner status to another active teammate.
 * Required before an existing Organization Owner can be deactivated or removed.
 */
export async function POST(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const body = await req.json();
    const targetUserId = String(body.targetUserId || "").trim();
    const confirmText = String(body.confirmText || "").trim().toUpperCase();

    if (!targetUserId) {
      return NextResponse.json(
        { error: "Please select an active team member to become the new Owner." },
        { status: 400 }
      );
    }

    if (confirmText !== "TRANSFER") {
      return NextResponse.json(
        { error: 'Please type "TRANSFER" to confirm ownership transfer.' },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database connection required to transfer ownership." },
        { status: 503 }
      );
    }

    const orgId = rbac.organizationId;
    const orgFilter = mongoose.Types.ObjectId.isValid(orgId)
      ? { _id: new mongoose.Types.ObjectId(orgId) }
      : { $or: [{ _id: orgId }, { slug: orgId }] };

    const org: any = await Organization.findOne(orgFilter).lean();
    if (!org) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 }
      );
    }

    const targetFilter = mongoose.Types.ObjectId.isValid(targetUserId)
      ? { $or: [{ _id: targetUserId }, { _id: new mongoose.Types.ObjectId(targetUserId) }] }
      : { _id: targetUserId };

    const orgMatch = mongoose.Types.ObjectId.isValid(orgId)
      ? { $or: [{ organizationId: orgId }, { organizationId: new mongoose.Types.ObjectId(orgId) }] }
      : { organizationId: orgId };

    const targetUser: any = await User.findOne({
      $and: [targetFilter, orgMatch, { role: { $ne: "super_admin" } }],
    }).lean();

    if (!targetUser) {
      return NextResponse.json(
        { error: "Selected team member not found in your organization." },
        { status: 404 }
      );
    }

    if (targetUser.isActive === false) {
      return NextResponse.json(
        { error: "New Organization Owner must be an active team member." },
        { status: 400 }
      );
    }

    const prevOwnerEmail = String(org.ownerEmail || org.email || "").toLowerCase();
    const nextOwnerEmail = String(targetUser.email || "").toLowerCase();

    if (prevOwnerEmail && prevOwnerEmail === nextOwnerEmail) {
      return NextResponse.json(
        { error: "This member is already the Organization Owner." },
        { status: 400 }
      );
    }

    await Organization.findOneAndUpdate(orgFilter, {
      $set: {
        ownerName: targetUser.name,
        ownerEmail: nextOwnerEmail,
      },
    });

    await User.findOneAndUpdate(targetFilter, {
      $set: { title: "Organization Owner", department: targetUser.department || "Admin" },
    });

    if (prevOwnerEmail) {
      await User.findOneAndUpdate(
        { email: prevOwnerEmail, ...orgMatch },
        { $set: { title: "Former Owner" } }
      );
    }

    await logAuditEvent({
      action: "OWNERSHIP_TRANSFERRED",
      category: "security",
      actorEmail: rbac.session.email,
      actorName: rbac.session.name || "Organization Admin",
      targetOrgId: String(org._id),
      targetOrgName: org.name,
      details: `Organization ownership transferred from ${prevOwnerEmail || "previous owner"} to ${targetUser.name} (${nextOwnerEmail}).`,
    });

    return NextResponse.json({
      success: true,
      newOwner: {
        userId: String(targetUser._id),
        name: targetUser.name,
        email: nextOwnerEmail,
      },
      message: `Ownership transferred to ${targetUser.name}.`,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to transfer ownership") },
      { status: 500 }
    );
  }
}
