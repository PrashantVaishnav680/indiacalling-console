import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, SessionPayload } from "@/lib/auth";
import { CanonicalUserRole, normalizeUserRole } from "@/types";

export type RbacGuardResult =
  | { ok: true; session: SessionPayload; organizationId: string }
  | { ok: false; response: NextResponse };

/**
 * Pure RBAC decision helper — unit-testable without NextRequest overhead.
 * Enforces the 2-role isolation matrix:
 * - "organization_private": ONLY `organization` role may access. `super_admin` is ALWAYS denied (Zero-PII isolation).
 * - "super_admin_only": ONLY `super_admin` role may access. `organization` is ALWAYS denied.
 * - "authenticated": Either `super_admin` or `organization` may access.
 */
export function evaluateRbacAccess(params: {
  session: SessionPayload | null;
  scope: "organization_private" | "super_admin_only" | "authenticated";
  targetOrganizationId?: string | null;
}): { allowed: boolean; status: number; error?: string; details?: string } {
  const { session, scope, targetOrganizationId } = params;

  if (!session) {
    return {
      allowed: false,
      status: 401,
      error: "Unauthorized",
      details: "Authentication is required to access this resource.",
    };
  }

  const role: CanonicalUserRole = normalizeUserRole(session.role);

  if (scope === "super_admin_only") {
    if (role !== "super_admin") {
      return {
        allowed: false,
        status: 403,
        error: "Forbidden",
        details: "Super Admin privileges are required to access platform controls.",
      };
    }
    return { allowed: true, status: 200 };
  }

  if (scope === "organization_private") {
    if (role === "super_admin") {
      return {
        allowed: false,
        status: 403,
        error: "Privacy Isolation Enforced",
        details:
          "Super Admin accounts cannot access private organization operational data (leads, calls, recordings, transcripts, agents, campaigns, or knowledge base files).",
      };
    }

    if (
      targetOrganizationId &&
      String(targetOrganizationId) !== String(session.organizationId)
    ) {
      return {
        allowed: false,
        status: 403,
        error: "Cross-Tenant Access Denied",
        details: "You can only access resources belonging to your own organization.",
      };
    }

    return { allowed: true, status: 200 };
  }

  return { allowed: true, status: 200 };
}

/**
 * Middleware guard for ANY Organization private operational endpoint:
 * Leads, Calls, Recordings, Transcripts, Agents, Campaigns, Knowledge Base, AI Prompt Assistant, Sales Handoff.
 * Strictly blocks Super Admin (403) and scopes queries to `session.organizationId`.
 */
export function requireOrganizationRole(req: NextRequest): RbacGuardResult {
  const session = getSessionFromRequest(req);
  const decision = evaluateRbacAccess({
    session,
    scope: "organization_private",
  });

  if (!decision.allowed || !session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: decision.error, details: decision.details },
        { status: decision.status }
      ),
    };
  }

  return {
    ok: true,
    session,
    organizationId: String(session.organizationId || "org_default_01"),
  };
}

/**
 * Middleware guard for Platform Super Admin endpoints:
 * Platform Overview KPIs, Organizations Directory, Platform Billing & Revenue.
 * Strictly blocks Organization accounts (403).
 */
export function requireSuperAdminRole(req: NextRequest): RbacGuardResult {
  const session = getSessionFromRequest(req);
  const decision = evaluateRbacAccess({
    session,
    scope: "super_admin_only",
  });

  if (!decision.allowed || !session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: decision.error, details: decision.details },
        { status: decision.status }
      ),
    };
  }

  return {
    ok: true,
    session,
    organizationId: "platform_hq",
  };
}

/**
 * Verifies that a fetched record belongs to the authenticated organization.
 */
export function assertTenantOwnership(
  sessionOrgId: string,
  resourceOrgId: string | undefined | null
): NextResponse | null {
  if (!resourceOrgId || String(resourceOrgId) !== String(sessionOrgId)) {
    return NextResponse.json(
      {
        error: "Cross-Tenant Access Denied",
        details: "This resource belongs to a different organization.",
      },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Strips all private operational fields from an Organization object before
 * returning it to a Super Admin endpoint (defense-in-depth Zero-PII sanitizer).
 */
export function sanitizeOrganizationForSuperAdmin(
  org: Record<string, any>,
  metrics: {
    agentCount: number;
    activeAgentCount: number;
    campaignCount: number;
    totalCalls: number;
    totalMinutes: number;
    totalSpendInr: number;
    unbilledSpendInr: number;
    dueAmountInr: number;
    teamMemberCount: number;
    planName?: string;
    billingStatus?: "settled" | "due" | "overdue";
  }
) {
  return {
    _id: String(org._id),
    name: org.name,
    slug: org.slug,
    email: org.email,
    phone: org.phone || "",
    industry: org.industry || "General Business",
    ownerName: org.ownerName || "",
    ownerEmail: org.ownerEmail || org.email,
    status: org.status === "inactive" ? "suspended" : org.status || "active",
    limits: {
      maxConcurrentCalls: org.settings?.maxConcurrentCalls ?? 10,
      maxAgents: org.settings?.maxAgents ?? 25,
      monthlyCallLimit: org.settings?.monthlyCallLimit ?? 10000,
    },
    metrics: {
      agentCount: metrics.agentCount,
      activeAgentCount: metrics.activeAgentCount,
      campaignCount: metrics.campaignCount,
      totalCalls: metrics.totalCalls,
      totalMinutes: metrics.totalMinutes,
      totalSpendInr: Number(metrics.totalSpendInr.toFixed(2)),
      unbilledSpendInr: Number(metrics.unbilledSpendInr.toFixed(2)),
      dueAmountInr: Number(metrics.dueAmountInr.toFixed(2)),
      teamMemberCount: metrics.teamMemberCount,
      planName: metrics.planName || org.billing?.planName || "Pay-As-You-Go",
      billingStatus:
        metrics.billingStatus ||
        (metrics.dueAmountInr > 0 ? "due" : "settled"),
    },
    managedServiceAccess: {
      enabled: Boolean(org.managedServiceAccess?.enabled),
      grantedAt: org.managedServiceAccess?.grantedAt || null,
      grantedBy: org.managedServiceAccess?.grantedBy || null,
      planLabel: org.managedServiceAccess?.planLabel || "Managed Service Plan",
    },
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  };
}
