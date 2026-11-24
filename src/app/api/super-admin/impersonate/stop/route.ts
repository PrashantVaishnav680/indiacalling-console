import { NextRequest, NextResponse } from "next/server";
import {
  getSessionFromRequest,
  signToken,
  AUTH_COOKIE_NAME,
  getRoleDisplayLabel,
} from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

/**
 * POST /api/super-admin/impersonate/stop
 * Restores the original Super Admin session cookie and logs `IMPERSONATION_ENDED`.
 */
export async function POST(req: NextRequest) {
  const session: any = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const originAdmin = session.impersonatedBy;
  if (!originAdmin || originAdmin.role !== "super_admin") {
    return NextResponse.json(
      { error: "Not currently in an active Managed Service impersonation session." },
      { status: 400 }
    );
  }

  const restoredSuperAdmin = {
    userId: originAdmin.userId,
    email: originAdmin.email,
    name: originAdmin.name,
    role: "super_admin" as const,
    canonicalRole: "super_admin" as const,
    roleLabel: getRoleDisplayLabel("super_admin"),
    organizationId: "platform_hq",
    workspaceName: "IndiaCalling Platform Control Center",
  };

  const token = signToken(restoredSuperAdmin as any);

  await logAuditEvent({
    action: "IMPERSONATION_ENDED",
    category: "security",
    actorEmail: originAdmin.email,
    actorName: originAdmin.name,
    targetOrgId: session.organizationId,
    targetOrgName: session.workspaceName,
    details: `Super Admin (${originAdmin.userId} / ${originAdmin.email}) exited Managed Service session for "${session.workspaceName}".`,
  });

  const res = NextResponse.json({
    success: true,
    redirectTo: "/super-admin/organizations",
    user: restoredSuperAdmin,
  });

  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return res;
}
