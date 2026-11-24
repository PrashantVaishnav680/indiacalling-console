import { connectToDatabase } from "@/lib/db";
import AuditLog from "@/models/AuditLog";

export interface AuditEventInput {
  action: string;
  category:
    | "auth"
    | "organization"
    | "billing"
    | "service_control"
    | "support"
    | "settings"
    | "security";
  actorEmail: string;
  actorName?: string;
  targetOrgId?: string;
  targetOrgName?: string;
  details: string;
}

/**
 * Non-blocking Zero-PII audit logger.
 * Records only workspace/account metadata (login, logout, plan change, team changes, admin actions).
 * NEVER pass customer phone numbers, lead names, call recordings, or transcripts here.
 */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const db = await connectToDatabase();
    if (!db) return;
    await AuditLog.create({
      action: input.action,
      category: input.category,
      actorEmail: input.actorEmail || "system@indiacalling.ai",
      actorName: input.actorName || "Workspace User",
      targetOrgId: input.targetOrgId,
      targetOrgName: input.targetOrgName,
      details: input.details,
    });
  } catch {
    // Never break user requests if audit logging fails
  }
}
