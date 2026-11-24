import { NextRequest, NextResponse } from "next/server";
import { requireOrganizationRole } from "@/lib/rbac";

/**
 * GET / PATCH /api/organizations/managed-access
 * Direct Super Admin workspace support access is enabled by default in v2.7.0.
 * Kept as a safe compatibility endpoint so legacy callers never receive 404/500.
 */
export async function GET(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  return NextResponse.json({
    managedServiceAccess: {
      enabled: true,
      directSuperAdminAccess: true,
      grantedAt: null,
      grantedBy: "Platform Default",
      planLabel: "Direct Platform Support",
    },
  });
}

export async function PATCH(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  return NextResponse.json({
    success: true,
    managedServiceAccess: {
      enabled: true,
      directSuperAdminAccess: true,
      grantedAt: null,
      grantedBy: "Platform Default",
      planLabel: "Direct Platform Support",
    },
    message: "Direct platform support access is active for all organizations.",
  });
}
