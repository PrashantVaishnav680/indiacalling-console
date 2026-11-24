import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getSessionFromRequest } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (session) {
    await logAuditEvent({
      action: session.role === "super_admin" ? "Super Admin Sign-Out" : "Organization Sign-Out",
      category: "auth",
      actorEmail: session.email,
      actorName: session.name,
      targetOrgId: session.organizationId,
      targetOrgName: session.workspaceName,
      details: `${session.name} signed out of ${session.workspaceName || "workspace"}.`,
    });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
