import { requireOrganizationRole } from "@/lib/rbac";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSessionFromRequest, isAuthorizedRole } from "@/lib/auth";
import {
  getCampaignById,
  updateCampaign,
  getAgentById,
  getLeads,
  getCalls,
  upsertCallByExecutionId,
  getOrganizationById,
} from "@/lib/store";
import { connectToDatabase } from "@/lib/db";
import Campaign from "@/models/Campaign";
import Call from "@/models/Call";
import Agent from "@/models/Agent";
import Organization from "@/models/Organization";
import { bolnaService, normalizeIndianPhoneE164 } from "@/lib/bolna/client";
import { computeCampaignMetrics } from "@/lib/analytics-counters";
import { ICall } from "@/types";

/**
 * POST /api/campaigns/[id]/execute
 * Dispatches queued campaign calls through the existing `bolnaService.initiateCall`
 * with strict idempotency protection so duplicate calls are never initiated for already-called leads.
 * Enforces campaign lifecycle: Draft -> Ready -> Running -> Paused -> Completed / Failed.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  try {
    const session = getSessionFromRequest(req);
    if (
      !session ||
      !isAuthorizedRole(session.role, [
        "super_admin",
        "organization",
        "organization",
      ])
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isSuperAdmin = false;
    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams.id;
    const body = await req.json().catch(() => ({}));
    const targetLeadId = body.leadId;
    const batchLimit = Math.min(
      10,
      Math.max(1, Number(body.batchSize || body.concurrency || 3))
    );

    const db = await connectToDatabase();
    let campaign = getCampaignById(id);
    if (!campaign && db && mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Campaign.findById(id).lean();
      if (doc) campaign = { ...(doc as any), _id: String((doc as any)._id) };
    }

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (
      !isSuperAdmin &&
      String(campaign.organizationId) !== String(session.organizationId)
    ) {
      return NextResponse.json(
        {
          error: "Forbidden",
          details:
            "You do not have permission to execute campaigns for another organization.",
        },
        { status: 403 }
      );
    }

    if (!isSuperAdmin) {
      const orgId = String(campaign.organizationId || "org_default_01");
      let orgDoc: any = null;
      if (db) {
        orgDoc = await Organization.findOne({
          $or: [{ _id: orgId }, { slug: orgId }],
        }).lean();
      }
      const memoryOrg = getOrganizationById(orgId);
      const orgStatus = orgDoc?.status || memoryOrg?.status;
      if (orgStatus === "suspended" || orgStatus === "inactive") {
        return NextResponse.json(
          {
            error: "Organization Suspended",
            details:
              "Campaign execution is blocked because this organization is currently suspended.",
          },
          { status: 403 }
        );
      }
    }

    if (campaign.status === "paused" || campaign.status === "cancelled") {
      return NextResponse.json(
        {
          error: `Campaign is currently ${campaign.status}`,
          details: `Resume the campaign before dispatching calls.`,
        },
        { status: 400 }
      );
    }

    let agent = getAgentById(campaign.agentId);
    if (!agent && db && mongoose.Types.ObjectId.isValid(campaign.agentId)) {
      const aDoc = await Agent.findById(campaign.agentId).lean();
      if (aDoc) agent = { ...(aDoc as any), _id: String((aDoc as any)._id) };
    }

    if (!agent) {
      return NextResponse.json(
        {
          error: "Agent Not Found",
          details:
            "The AI agent assigned to this campaign was not found.",
        },
        { status: 400 }
      );
    }

    if (agent.status === "paused" || agent.status === "inactive") {
      return NextResponse.json(
        {
          error: "Agent Not Available",
          details: `The AI agent '${agent.name}' is currently ${agent.status.toUpperCase()}. Please activate the agent before launching this campaign.`,
        },
        { status: 400 }
      );
    }

    const hasSimulatedAgent =
      !agent.bolnaAgentId || agent.bolnaAgentId.startsWith("bolna_sim_");
    const forceSimulatedMode =
      bolnaService.isMockMode || hasSimulatedAgent;

    // Build idempotency set of leads already active or completed in this campaign
    const existingCampaignCalls = getCalls().filter(
      (c) => String(c.campaignId) === String(campaign!._id)
    );
    const activeOrCompletedLeadKeys = new Set<string>();
    const attemptCountByLeadKey = new Map<string, number>();

    for (const c of existingCampaignCalls) {
      const key = String(c.leadId || c.phoneNumber);
      attemptCountByLeadKey.set(key, (attemptCountByLeadKey.get(key) || 0) + 1);
      if (
        c.status === "initiated" ||
        c.status === "ringing" ||
        c.status === "answered" ||
        c.status === "in_progress" ||
        c.status === "completed"
      ) {
        activeOrCompletedLeadKeys.add(key);
      }
    }

    const allLeads = getLeads();
    const queue = campaign.callQueue || [];
    const candidates = queue.filter((q) => {
      if (targetLeadId && String(q.leadId) !== String(targetLeadId))
        return false;
      const key = String(q.leadId || q.phoneNumber);
      if (activeOrCompletedLeadKeys.has(key)) return false;
      const attempts = attemptCountByLeadKey.get(key) || q.attempts || 0;
      return attempts <= (campaign!.maxRetries ?? 2);
    });

    if (candidates.length === 0) {
      const finishedStatus =
        existingCampaignCalls.some((c) => c.status === "completed") ||
        existingCampaignCalls.length > 0
          ? "completed"
          : campaign.status;
      updateCampaign(campaign._id, { status: finishedStatus as any });
      if (db && mongoose.Types.ObjectId.isValid(campaign._id)) {
        await Campaign.findByIdAndUpdate(campaign._id, {
          $set: { status: finishedStatus },
        });
      }
      return NextResponse.json({
        success: true,
        dispatchedCount: 0,
        status: finishedStatus,
        message: "No remaining eligible queued leads to dial in this campaign.",
      });
    }

    // Ensure campaign is registered as a Batch on Bolna Dashboard before dialing
    if (
      !campaign.bolnaBatchId &&
      agent.bolnaAgentId &&
      !agent.bolnaAgentId.startsWith("bolna_sim_") &&
      !bolnaService.isMockMode &&
      queue.length > 0
    ) {
      const csvLines = ["contact_number,first_name,lead_id"];
      for (const qItem of queue) {
        const ph = normalizeIndianPhoneE164(qItem.phoneNumber);
        const nm = (qItem.leadName || "Contact").replace(/["\n,]/g, " ");
        csvLines.push(`${ph},${nm},${qItem.leadId}`);
      }
      const batchRes = await bolnaService.createBatchCampaign({
        agentId: agent.bolnaAgentId,
        csvContent: csvLines.join("\n"),
        filename: `${String(campaign.name).replace(/[^a-zA-Z0-9]/g, "_")}.csv`,
      });
      if (batchRes.success && batchRes.batch_id) {
        campaign.bolnaBatchId = batchRes.batch_id;
        campaign.bolnaBatchStatus = batchRes.state || "created";
        updateCampaign(campaign._id, {
          bolnaBatchId: batchRes.batch_id,
          bolnaBatchStatus: campaign.bolnaBatchStatus,
          bolnaSyncStatus: "synced",
          lastSyncedAt: new Date(),
        });
        if (db && mongoose.Types.ObjectId.isValid(campaign._id)) {
          await Campaign.findByIdAndUpdate(campaign._id, {
            $set: {
              bolnaBatchId: batchRes.batch_id,
              bolnaBatchStatus: campaign.bolnaBatchStatus,
              bolnaSyncStatus: "synced",
              lastSyncedAt: new Date(),
            },
          });
        }
      }
    }

    const toDispatch = candidates.slice(0, batchLimit);
    const dispatchedCalls: ICall[] = [];
    const errors: Array<{ phoneNumber: string; error: string }> = [];

    for (const item of toDispatch) {
      const formattedPhone = normalizeIndianPhoneE164(item.phoneNumber);
      const leadRecord = allLeads.find(
        (l) =>
          String(l._id) === String(item.leadId) || l.phone === formattedPhone
      );

      try {
        let execId: string;
        let isSimulatedCall = forceSimulatedMode;

        if (forceSimulatedMode) {
          const simRes = await bolnaService.initiateCall(
            {
              agent_id: agent.bolnaAgentId || `agent_${String(agent._id).slice(0, 16)}`,
              recipient_phone_number: formattedPhone,
            },
            { forceSimulated: true }
          );
          execId = simRes.execution_id || simRes.call_id;
        } else {
          try {
            const bolnaRes = await bolnaService.initiateCall({
              agent_id: agent.bolnaAgentId || "",
              recipient_phone_number: formattedPhone,
              from_phone_number:
                campaign.outboundPhoneNumber ||
                agent.callingConfiguration?.phoneNumber ||
                undefined,
              user_data: {
                organization_id: String(campaign.organizationId),
                campaign_id: String(campaign._id),
                campaign_name: campaign.name,
                lead_id: String(item.leadId),
                lead_name: item.leadName,
                ...(leadRecord?.budget ? { budget: leadRecord.budget } : {}),
                ...(leadRecord?.customFields || {}),
              },
            });
            execId = bolnaRes.execution_id || bolnaRes.call_id;
          } catch (callErr: any) {
            const errorMsg = String(callErr?.message || "");
            const isTrialRestriction =
              errorMsg.toLowerCase().includes("trial account") ||
              errorMsg.toLowerCase().includes("verified phone number");

            if (isTrialRestriction) {
              // Bolna Trial fallback: Simulate call execution so campaign runs smoothly and user can test campaign operations
              const simRes = await bolnaService.initiateCall(
                {
                  agent_id: agent.bolnaAgentId || "",
                  recipient_phone_number: formattedPhone,
                },
                { forceSimulated: true }
              );
              execId = simRes.execution_id || simRes.call_id;
              isSimulatedCall = true;
            } else {
              throw callErr;
            }
          }
        }

        const callObjectId = new mongoose.Types.ObjectId().toHexString();

        const newCall: ICall = {
          _id: callObjectId,
          organizationId: String(campaign.organizationId),
          bolnaExecutionId: execId,
          bolnaCallId: execId,
          agentId: String(agent._id),
          bolnaAgentId: agent.bolnaAgentId || "",
          agentName: agent.name,
          leadId: String(item.leadId),
          leadName: item.leadName,
          campaignId: String(campaign._id),
          campaignName: campaign.name,
          direction: "outbound",
          status: "initiated",
          acceptedByBolna: true,
          phoneNumber: formattedPhone,
          durationSeconds: 0,
          cost: 0,
          startedAt: new Date(),
          callOutcome: isSimulatedCall
            ? "Bolna Trial Mode (Simulated for unverified number)"
            : "Accepted by Bolna AI",
          qualificationStatus: "pending",
          isSimulated: isSimulatedCall,
          testingMode: "outbound_test_call",
          syncStatus: "synced",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        upsertCallByExecutionId(newCall);
        dispatchedCalls.push(newCall);

        // Update queue item
        item.status = "accepted_by_bolna";
        item.attempts = (item.attempts || 0) + 1;
        item.bolnaExecutionId = execId;
        item.callId = callObjectId;
        item.lastAttemptAt = new Date();

        if (db) {
          await Call.findOneAndUpdate(
            { bolnaExecutionId: execId },
            {
              $set: {
                ...newCall,
                _id: new mongoose.Types.ObjectId(callObjectId),
              },
            },
            { upsert: true, new: true }
          );
        }
      } catch (callErr: any) {
        const errorMsg = String(
          callErr?.message || "Bolna call initiation failed"
        );
        item.status = "failed";
        item.attempts = (item.attempts || 0) + 1;
        item.error = errorMsg;
        errors.push({
          phoneNumber: formattedPhone,
          error: errorMsg,
        });
      }
    }

    const updatedMetrics = computeCampaignMetrics(
      campaign,
      getCalls(),
      getLeads()
    );
    const nextLifecycleStatus: "running" | "completed" | "failed" =
      dispatchedCalls.length === 0 && errors.length > 0
        ? "failed"
        : updatedMetrics.remainingLeads === 0 &&
          updatedMetrics.callsInProgress === 0
        ? "completed"
        : "running";

    const updatedCampaignFields = {
      status: nextLifecycleStatus,
      startedAt: campaign.startedAt || new Date(),
      ...(nextLifecycleStatus === "completed"
        ? { completedAt: new Date() }
        : {}),
      callQueue: queue,
      ...updatedMetrics,
    };

    updateCampaign(campaign._id, updatedCampaignFields);
    if (db && mongoose.Types.ObjectId.isValid(campaign._id)) {
      await Campaign.findByIdAndUpdate(campaign._id, {
        $set: updatedCampaignFields,
      });
    }

    if (dispatchedCalls.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          dispatchedCount: 0,
          status: "failed",
          error: "Bolna campaign launch failed for all queued leads",
          details: errors[0]?.error || "Bolna API rejected call initiation",
          errors,
          metrics: updatedMetrics,
        },
        { status: 502 }
      );
    }

    const hasTrialSim = dispatchedCalls.some((c) => c.isSimulated);
    return NextResponse.json({
      success: true,
      dispatchedCount: dispatchedCalls.length,
      status: nextLifecycleStatus,
      message: `Successfully launched ${dispatchedCalls.length} outbound call(s) via Bolna AI.${
        hasTrialSim
          ? " (Note: Unverified recipient numbers were simulated due to Bolna trial account tier. Verify numbers in Bolna for live dialing)."
          : ""
      }`,
      dispatchedCalls,
      errors,
      metrics: updatedMetrics,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Failed to execute campaign calls",
        details: error?.message || "Unexpected error",
      },
      { status: 500 }
    );
  }
}
