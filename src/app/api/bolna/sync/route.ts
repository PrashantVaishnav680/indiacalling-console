import { requireOrganizationRole, assertTenantOwnership } from "@/lib/rbac";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getSyncState } from "@/lib/store";
import { bolnaService } from "@/lib/bolna/client";
import { syncBolnaAgentsAndCalls } from "@/lib/bolna/sync-service";

export async function GET(req: NextRequest) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  return NextResponse.json({
    syncState: getSyncState(),
    bolnaMode: bolnaService.isMockMode ? "simulated" : "live",
  });
}

export async function POST(req: NextRequest) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  try {
    const session = getSessionFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const result = await syncBolnaAgentsAndCalls({
      organizationId: session?.organizationId || "org_default_01",
      targetAgentId: body.agentId,
      syncAgents: body.syncAgents ?? true,
      syncCalls: body.syncCalls ?? true,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: "Bolna synchronization failed",
        details: error?.message || "Unexpected synchronization error",
      },
      { status: 500 }
    );
  }
}
