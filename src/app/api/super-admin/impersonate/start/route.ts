import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireSuperAdminRole } from "@/lib/rbac";
import { signToken, AUTH_COOKIE_NAME, getRoleDisplayLabel } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import Organization from "@/models/Organization";
import { logAuditEvent } from "@/lib/audit";
import { formatErrorMessage } from "@/lib/error-formatter";

/**
 * POST /api/super-admin/impersonate/start
 * Allows an authenticated `super_admin` to directly access any existing organization workspace
 * with a scoped `organization` session cookie preserving `impersonatedBy` metadata
 * and writes `IMPERSONATION_STARTED` into `AuditLog`.
 */
export async function POST(req: NextRequest) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const body = await req.json();
    const organizationId = String(body.organizationId || "").trim();
    if (!organizationId) {
      return NextResponse.json(
        { error: "Please select an organization to access." },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database connection is required to open an organization workspace." },
        { status: 503 }
      );
    }

    const filter = mongoose.Types.ObjectId.isValid(organizationId)
      ? { _id: new mongoose.Types.ObjectId(organizationId) }
      : { $or: [{ _id: organizationId }, { slug: organizationId }] };

    const org: any = await Organization.findOne(filter).lean();
    if (!org) {
      return NextResponse.json(
        { error: "The selected organization could not be found." },
        { status: 404 }
      );
    }

    const targetOrgId = String(org._id);
    const impersonatedPayload = {
      userId: rbac.session.userId,
      email: org.ownerEmail || org.email || rbac.session.email,
      name: `${rbac.session.name} (Platform Admin)`,
      role: "organization" as const,
      canonicalRole: "organization" as const,
      roleLabel: getRoleDisplayLabel("organization"),
      organizationId: targetOrgId,
      workspaceName: org.name,
      impersonatedBy: {
        userId: rbac.session.userId,
        email: rbac.session.email,
        name: rbac.session.name,
        role: "super_admin" as const,
      },
    };

    const token = signToken(impersonatedPayload as any);

    await logAuditEvent({
      action: "IMPERSONATION_STARTED",
      category: "security",
      actorEmail: rbac.session.email,
      actorName: rbac.session.name,
      targetOrgId,
      targetOrgName: org.name,
      details: `${rbac.session.name} (${rbac.session.email}) opened a direct workspace support session for ${org.name}.`,
    });

    const res = NextResponse.json({
      success: true,
      redirectTo: "/overview",
      organizationName: org.name,
      user: impersonatedPayload,
    });

    res.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 4 * 60 * 60, // 4-hour scoped workspace session
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Could not open the organization workspace.") },
      { status: 500 }
    );
  }
}
