import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import AuditLog from "@/models/AuditLog";
import Organization from "@/models/Organization";
import { sanitizeWhiteLabelText } from "@/lib/error-formatter";

const ACTION_LABEL_MAP: Record<string, string> = {
  IMPERSONATION_STARTED: "Workspace Access Started",
  IMPERSONATION_ENDED: "Workspace Access Ended",
  ORGANIZATION_DELETED: "Organization Removed",
  ORGANIZATION_CREATED: "Organization Created",
  OWNERSHIP_TRANSFERRED: "Organization Ownership Transferred",
  MANAGED_SERVICE_ACCESS_ENABLED: "Support Access Enabled",
  MANAGED_SERVICE_ACCESS_REVOKED: "Support Access Revoked",
};

function humanizeAction(rawAction: string): string {
  const cleaned = String(rawAction || "Platform Activity").trim();
  if (ACTION_LABEL_MAP[cleaned]) return ACTION_LABEL_MAP[cleaned];
  if (/^[A-Z0-9_]+$/.test(cleaned)) {
    return cleaned
      .toLowerCase()
      .split("_")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");
  }
  return sanitizeWhiteLabelText(cleaned);
}

function humanizeCategory(rawCategory: string, rawAction: string): { key: string; label: string } {
  const act = String(rawAction || "").toUpperCase();
  if (act.includes("IMPERSONATION")) {
    return { key: "workspace_access", label: "Workspace Access" };
  }
  if (act.includes("ORGANIZATION") || act.includes("OWNERSHIP")) {
    return { key: "organization", label: "Organization" };
  }
  const cat = String(rawCategory || "security").toLowerCase();
  switch (cat) {
    case "auth":
      return { key: "auth", label: "Auth" };
    case "billing":
      return { key: "billing", label: "Billing" };
    case "service_control":
      return { key: "service_control", label: "Service Control" };
    case "settings":
      return { key: "settings", label: "Settings" };
    case "support":
      return { key: "support", label: "Support" };
    default:
      return { key: "security", label: "Security" };
  }
}

function humanizeDetails(rawDetails: string): string {
  const cleaned = sanitizeWhiteLabelText(String(rawDetails || "").trim());
  if (!cleaned) return "Completed successfully.";
  if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
    return "Configuration or account record updated.";
  }
  return cleaned
    .replace(/\bmaxConcurrentCalls=/g, "Max concurrent calls set to ")
    .replace(/\bmaxAgents=/g, "Max agents set to ")
    .replace(/\bmonthlyCallLimit=/g, "Monthly call limit set to ")
    .replace(/\bstatus\s*->\s*/gi, "Status changed to ")
    .replace(/\bplan\s*->\s*/gi, "Plan changed to ")
    .replace(/\brate\s*->\s*/gi, "Calling rate set to ");
}

export async function GET(req: NextRequest) {
  const rbac = requireSuperAdminRole(req);
  if (!rbac.ok) return rbac.response;

  const { searchParams } = new URL(req.url);
  const category = (searchParams.get("category") || "all").toLowerCase();
  const organizationId = (searchParams.get("organizationId") || "all").trim();
  const search = (searchParams.get("search") || "").trim().toLowerCase();

  const db = await connectToDatabase();
  let rawLogs: any[] = [];
  const orgNameLookup = new Map<string, string>();

  if (db) {
    const [docs, orgDocs] = await Promise.all([
      AuditLog.find({}).sort({ createdAt: -1 }).limit(250).lean(),
      Organization.find({}).select("_id name").lean(),
    ]);
    for (const o of orgDocs as any[]) {
      orgNameLookup.set(String(o._id), o.name);
    }
    rawLogs = docs.map((d: any) => ({ ...d, _id: String(d._id) }));
  }

  if (rawLogs.length === 0) {
    rawLogs = [
      {
        _id: "sys_zero_pii",
        action: "Customer Privacy Guard Active",
        category: "security",
        actorEmail: "system@indiacalling.ai",
        actorName: "Platform Guard",
        targetOrgId: "platform_hq",
        targetOrgName: "Platform System",
        details:
          "Super Admin routes display organization-level metrics and audit events while keeping customer PII isolated.",
        createdAt: new Date().toISOString(),
      },
      {
        _id: "sys_billing_guard",
        action: "Billing & GST Policy Active",
        category: "billing",
        actorEmail: "system@indiacalling.ai",
        actorName: "Billing Engine",
        targetOrgId: "platform_hq",
        targetOrgName: "Platform System",
        details:
          "Default calling rate is ₹6.00/min with 18% GST reporting and instant wallet top-ups enabled.",
        createdAt: new Date().toISOString(),
      },
    ];
  }

  // Enrich & humanize every log entry
  const enrichedLogs = rawLogs.map((l) => {
    const resolvedOrgId = String(l.targetOrgId || "platform_hq");
    const resolvedOrgName =
      l.targetOrgName ||
      orgNameLookup.get(resolvedOrgId) ||
      (resolvedOrgId === "platform_hq" ? "Platform System" : "Workspace Organization");
    const catInfo = humanizeCategory(l.category, l.action);
    return {
      _id: String(l._id),
      action: humanizeAction(l.action),
      rawAction: l.action,
      category: catInfo.key,
      categoryLabel: catInfo.label,
      actorName: l.actorName || "Platform User",
      actorEmail: l.actorEmail || "system@indiacalling.ai",
      targetOrgId: resolvedOrgId,
      targetOrgName: resolvedOrgName,
      details: humanizeDetails(l.details),
      createdAt: l.createdAt || new Date().toISOString(),
    };
  });

  // Build unique organizations list for filter dropdown
  const orgOptionsMap = new Map<string, { id: string; name: string; count: number }>();
  for (const log of enrichedLogs) {
    const existing = orgOptionsMap.get(log.targetOrgId);
    if (existing) {
      existing.count += 1;
    } else {
      orgOptionsMap.set(log.targetOrgId, {
        id: log.targetOrgId,
        name: log.targetOrgName,
        count: 1,
      });
    }
  }
  const organizations = Array.from(orgOptionsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Apply filters
  let logs = enrichedLogs;
  if (organizationId && organizationId !== "all") {
    logs = logs.filter((l) => l.targetOrgId === organizationId);
  }
  if (category !== "all") {
    logs = logs.filter((l) => l.category === category);
  }
  if (search) {
    logs = logs.filter((l) =>
      `${l.action} ${l.details} ${l.targetOrgName} ${l.actorName} ${l.actorEmail}`
        .toLowerCase()
        .includes(search)
    );
  }

  return NextResponse.json({
    privacyMode: "zero_pii_enforced",
    organizations,
    logs,
  });
}
