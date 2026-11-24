import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import { requireOrganizationRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import Lead from "@/models/Lead";
import { getLeadById, updateLead } from "@/lib/store";

/**
 * POST /api/leads/[id]/outcome
 * Allows a salesperson to log a post-call outcome (Interested, Callback Scheduled,
 * Cancelled / Not Interested, Converted) with a reason note that appends directly
 * to the Lead's chronological interactionTimeline and updates its live status.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  try {
    const { id } = await Promise.resolve(context.params);
    const body = await req.json();
    const outcome = String(body.outcome || "").trim();
    const reason = String(body.reason || "").trim();

    if (!outcome) {
      return NextResponse.json({ error: "Outcome is required." }, { status: 400 });
    }

    const db = await connectToDatabase();
    let existing: any = null;
    if (db && mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Lead.findById(id).lean();
      if (doc) existing = { ...(doc as any), _id: String((doc as any)._id) };
    }
    if (!existing) existing = getLeadById(id);

    if (!existing) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    if (String(existing.organizationId) !== String(rbac.organizationId)) {
      return NextResponse.json(
        { error: "Forbidden", details: "Cross-organization lead update is blocked." },
        { status: 403 }
      );
    }

    const lower = outcome.toLowerCase();
    let nextStatus = existing.qualificationStatus || "contacted";
    let nextInterest = existing.interestLevel || "unknown";

    if (lower.includes("cancel") || lower.includes("not interested") || lower.includes("declined")) {
      nextStatus = "lost";
      nextInterest = "low";
    } else if (lower.includes("converted")) {
      nextStatus = "converted";
      nextInterest = "high";
    } else if (lower.includes("callback") || lower.includes("schedule")) {
      nextStatus = "call_scheduled";
      if (nextInterest === "unknown" || nextInterest === "low") nextInterest = "medium";
    } else if (lower.includes("interested")) {
      nextStatus = "qualified";
      nextInterest = "high";
    }

    const newEvent = {
      id: `sp_${Date.now()}`,
      actorType: "salesperson" as const,
      actorName: rbac.session.name || "Salesperson",
      outcome,
      reason: reason || `Logged outcome "${outcome}" by ${rbac.session.name || "Salesperson"}.`,
      createdAt: new Date(),
    };

    const nextTimeline = [
      ...(Array.isArray(existing.interactionTimeline) ? existing.interactionTimeline : []),
      newEvent,
    ];
    const nextNotes = reason
      ? [...(Array.isArray(existing.notes) ? existing.notes : []), `[${outcome}] ${reason}`]
      : existing.notes || [];

    const updates = {
      qualificationStatus: nextStatus,
      interestLevel: nextInterest,
      interactionTimeline: nextTimeline,
      notes: nextNotes,
      updatedAt: new Date(),
    };

    if (db && mongoose.Types.ObjectId.isValid(id)) {
      await Lead.findByIdAndUpdate(id, { $set: updates });
    }
    const updated = updateLead(id, updates as any) || { ...existing, ...updates };

    return NextResponse.json({
      success: true,
      lead: updated,
      event: newEvent,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to log salesperson outcome") },
      { status: 500 }
    );
  }
}
