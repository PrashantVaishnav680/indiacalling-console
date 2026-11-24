import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import { requireOrganizationRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import Lead from "@/models/Lead";
import Agent from "@/models/Agent";
import Call from "@/models/Call";
import { getLeadById, updateLead, addAssignment, getAgentById, addCall } from "@/lib/store";
import { computeScheduledCallStatus } from "@/lib/call-scheduling";
import {
  bolnaService,
  formatBolnaScheduledAt,
  normalizeIndianPhoneE164,
} from "@/lib/bolna/client";

/**
 * POST /api/leads/[id]/schedule
 * Schedules or updates a real-time follow-up call for a qualified lead, assigns a team member,
 * optionally schedules an automated Bolna AI outbound call at the exact scheduledAt timestamp,
 * persists to MongoDB, and returns live schedule status (`Scheduled`, `Due Now`, `Completed`, `Missed`).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const rbac = requireOrganizationRole(req);
    if (!rbac.ok) return rbac.response;

    const { id } = await Promise.resolve(context.params);
    const body = await req.json();

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
        { error: "Forbidden", details: "Cross-organization call scheduling is blocked." },
        { status: 403 }
      );
    }

    const scheduledAtRaw = body.scheduledAt || existing.scheduledCall?.scheduledAt;
    const parsedDate = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: "A valid scheduled date and time is required." },
        { status: 400 }
      );
    }

    const timezone = String(body.timezone || "Asia/Kolkata").trim();
    const notes = String(body.notes || "").trim();
    const rawStatus = String(body.status || "scheduled").toLowerCase();
    const status = (["scheduled", "completed", "missed", "cancelled"].includes(rawStatus)
      ? rawStatus
      : "scheduled") as "scheduled" | "completed" | "missed" | "cancelled";

    const assignedToId = body.assignedSalespersonId || existing.assignedSalespersonId || rbac.session.userId;
    const assignedToName =
      body.assignedSalespersonName || existing.assignedSalespersonName || rbac.session.name || "Sales Rep";

    // Optional Automated AI Scheduled Calling via Bolna POST /call with scheduled_at
    const autoDialWithAi = Boolean(body.autoDialWithAi) && status === "scheduled";
    let aiCallScheduled = false;
    let bolnaCallId: string | undefined = existing.scheduledCall?.bolnaCallId;
    let scheduledAgentId: string | undefined = existing.scheduledCall?.agentId;
    let scheduledAgentName: string | undefined = existing.scheduledCall?.agentName;
    let aiScheduleWarning: string | undefined;

    if (autoDialWithAi) {
      const requestedAgentId = String(body.agentId || "").trim();
      if (!requestedAgentId) {
        return NextResponse.json(
          { error: "Select an active AI Voice Agent to enable automated scheduled dialing." },
          { status: 400 }
        );
      }

      let agentDoc: any = null;
      if (db && mongoose.Types.ObjectId.isValid(requestedAgentId)) {
        const found = await Agent.findById(requestedAgentId).lean();
        if (found) agentDoc = { ...(found as any), _id: String((found as any)._id) };
      }
      if (!agentDoc) agentDoc = getAgentById(requestedAgentId);

      if (!agentDoc || String(agentDoc.organizationId) !== String(rbac.organizationId)) {
        return NextResponse.json(
          { error: "Selected AI agent was not found in your organization." },
          { status: 404 }
        );
      }

      const bolnaAgentId = String(agentDoc.bolnaAgentId || "").trim();
      if (!bolnaAgentId) {
        return NextResponse.json(
          { error: "Selected AI agent is not synced with Bolna yet. Open AI Agents and save/sync it first." },
          { status: 400 }
        );
      }

      const e164Phone = normalizeIndianPhoneE164(String(existing.phone || ""));
      const isFuture = parsedDate.getTime() > Date.now() + 60_000;

      const bolnaRes = await bolnaService.initiateCall({
        agent_id: bolnaAgentId,
        recipient_phone_number: e164Phone,
        scheduled_at: isFuture ? formatBolnaScheduledAt(parsedDate) : undefined,
        user_data: {
          lead_id: String(existing._id),
          lead_name: existing.name || "Customer",
          company: existing.company || "",
          follow_up_notes: notes || "Scheduled follow-up call",
        },
      });

      aiCallScheduled = true;
      bolnaCallId = bolnaRes.execution_id || bolnaRes.call_id;
      scheduledAgentId = String(agentDoc._id);
      scheduledAgentName = String(agentDoc.name || "AI Voice Agent");

      // Record queued call in Call History so the scheduled AI call is immediately traceable
      const callRecord: Record<string, any> = {
        organizationId: rbac.organizationId,
        agentId: scheduledAgentId,
        agentName: scheduledAgentName,
        leadId: String(existing._id),
        leadName: existing.name,
        leadPhone: e164Phone,
        direction: "outbound",
        status: "queued",
        bolnaCallId,
        summary: isFuture
          ? `AI follow-up call scheduled for ${parsedDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`
          : "AI follow-up call triggered immediately",
        startedAt: parsedDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (db) {
        try {
          await Call.create(callRecord);
        } catch (callErr: any) {
          aiScheduleWarning = callErr?.message;
        }
      }
      addCall({
        _id: `call_sched_${Date.now()}`,
        ...(callRecord as any),
      });
    }

    const scheduledCall = {
      scheduledAt: parsedDate,
      timezone,
      notes,
      status,
      assignedToId: String(assignedToId || ""),
      assignedToName: String(assignedToName || ""),
      autoDialWithAi,
      ...(scheduledAgentId ? { agentId: scheduledAgentId } : {}),
      ...(scheduledAgentName ? { agentName: scheduledAgentName } : {}),
      ...(bolnaCallId ? { bolnaCallId } : {}),
      updatedAt: new Date(),
    };

    const nextQualStatus =
      status === "completed"
        ? body.qualificationStatus || "contacted"
        : status === "scheduled"
        ? "call_scheduled"
        : existing.qualificationStatus;

    const aiTag = aiCallScheduled && scheduledAgentName ? ` [AI Auto-Dial: ${scheduledAgentName}]` : "";
    const noteEntry =
      notes || aiCallScheduled
        ? `Call ${status} (${parsedDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST)${aiTag}${notes ? `: ${notes}` : ""}`
        : null;

    const updatedNotes = noteEntry
      ? [...(Array.isArray(existing.notes) ? existing.notes : []), noteEntry]
      : existing.notes || [];

    const updates: Record<string, any> = {
      scheduledCall,
      followUpAt: parsedDate,
      assignedSalespersonId: scheduledCall.assignedToId,
      assignedSalespersonName: scheduledCall.assignedToName,
      qualificationStatus: nextQualStatus,
      notes: updatedNotes,
      updatedAt: new Date(),
    };

    if (db && mongoose.Types.ObjectId.isValid(id)) {
      await Lead.findByIdAndUpdate(id, { $set: updates });
    }

    const updatedLead = updateLead(id, updates) || { ...existing, ...updates };

    addAssignment({
      _id: `assign_${Date.now()}`,
      organizationId: rbac.organizationId,
      leadId: String(existing._id),
      leadName: `${existing.name} (${existing.company || "Direct"})`,
      salespersonId: scheduledCall.assignedToId,
      salespersonName: scheduledCall.assignedToName,
      assignedBy: rbac.session.name || "Organization",
      assignmentMethod: "manual",
      status: status === "completed" ? "completed" : "accepted",
      assignedAt: new Date(),
      acceptedAt: new Date(),
      notes: notes || `Follow-up call scheduled for ${parsedDate.toISOString()}${aiTag}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      lead: updatedLead,
      scheduledCall,
      liveStatus: computeScheduledCallStatus(scheduledCall),
      aiCallScheduled,
      bolnaCallId: bolnaCallId || null,
      ...(aiScheduleWarning ? { warning: aiScheduleWarning } : {}),
    });
  } catch (err: any) {
    console.error("[POST /api/leads/[id]/schedule] error:", err);
    return NextResponse.json(
      { error: formatErrorMessage(err, 500, "Failed to schedule call") },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  return POST(req, context);
}
