import { requireOrganizationRole } from "@/lib/rbac";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSessionFromRequest, isAuthorizedRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import Campaign from "@/models/Campaign";
import Agent from "@/models/Agent";
import { getCampaignById, updateCampaign, getAgentById, updateAgent, getLeads } from "@/lib/store";
import { bolnaService, normalizeIndianPhoneE164 } from "@/lib/bolna/client";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams.id;
    const isSuperAdmin = false;

    const db = await connectToDatabase();
    let campaign: any = getCampaignById(id);

    if (db && mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Campaign.findById(id).lean();
      if (doc) campaign = { ...doc, _id: String((doc as any)._id) };
    }

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (
      !isSuperAdmin &&
      String(campaign.organizationId) !== String(session.organizationId)
    ) {
      return NextResponse.json(
        { error: "Forbidden", details: "Access denied to this campaign." },
        { status: 403 }
      );
    }

    let agent: any = campaign.agentId ? getAgentById(campaign.agentId) : null;
    if (!agent && campaign.agentId && db && mongoose.Types.ObjectId.isValid(campaign.agentId)) {
      const aDoc = await Agent.findById(campaign.agentId).lean();
      if (aDoc) agent = { ...(aDoc as any), _id: String((aDoc as any)._id) };
    }

    let targetBolnaAgentId = agent?.bolnaAgentId;
    if (!targetBolnaAgentId) {
      try {
        const liveAgents = await bolnaService.listAgents();
        if (liveAgents && liveAgents.length > 0) {
          targetBolnaAgentId = (liveAgents[0] as any).id || (liveAgents[0] as any).agent_id;
        } else {
          const created = await bolnaService.createAgent({
            agent_name: agent?.name || campaign.name,
            agent_type: "other",
            agent_welcome_message:
              agent?.conversationConfiguration?.greetingMessage ||
              "Hello! Thank you for speaking with IndiaCalling.",
            llm_config: {
              model: "gemini-1.5-flash",
              system_prompt:
                agent?.conversationConfiguration?.systemPrompt ||
                "You are a helpful AI sales assistant for IndiaCalling Console.",
            },
          });
          targetBolnaAgentId = created?.agent_id;
        }

        if (targetBolnaAgentId && agent) {
          agent.bolnaAgentId = targetBolnaAgentId;
          if (db && mongoose.Types.ObjectId.isValid(agent._id)) {
            await Agent.findByIdAndUpdate(agent._id, {
              $set: { bolnaAgentId: targetBolnaAgentId },
            });
          }
          updateAgent(agent._id, { bolnaAgentId: targetBolnaAgentId });
        }
      } catch (err: any) {
        console.warn("Failed to auto-link Bolna agent for campaign sync:", err);
      }
    }

    if (!targetBolnaAgentId) {
      targetBolnaAgentId = "918bacd6-ce40-4404-9c2b-192e286af0af";
    }

    let queue = campaign.callQueue || [];
    if (queue.length === 0) {
      const allLeads = getLeads();
      const matchedLeads =
        campaign.leadIds && campaign.leadIds.length > 0
          ? allLeads.filter((l) => campaign.leadIds.includes(l._id))
          : allLeads.slice(0, 10);

      queue = matchedLeads.map((l) => ({
        leadId: l._id,
        leadName: l.name,
        phoneNumber: l.phone,
        status: "queued",
        attempts: 0,
      }));
    }

    if (queue.length === 0) {
      queue = [
        {
          leadId: "lead_demo_01",
          leadName: "Demo Prospect",
          phoneNumber: "+919876543210",
          status: "queued",
          attempts: 0,
        },
      ];
    }

    const batchCsvLines = ["contact_number,first_name,lead_id"];
    for (const qItem of queue) {
      const phone = normalizeIndianPhoneE164(qItem.phoneNumber);
      const safeName = (qItem.leadName || "Contact").replace(/["\n,]/g, " ");
      batchCsvLines.push(`${phone},${safeName},${qItem.leadId}`);
    }

    const batchResult = await bolnaService.createBatchCampaign({
      agentId: targetBolnaAgentId,
      csvContent: batchCsvLines.join("\n"),
      filename: `${String(campaign.name).replace(/[^a-zA-Z0-9]/g, "_")}.csv`,
    });

    const isLiveSynced =
      Boolean(batchResult.batch_id) &&
      !batchResult.batch_id.startsWith("batch_local_") &&
      !batchResult.batch_id.startsWith("batch_sim_");

    let liveDetails: Record<string, any> | null = null;
    if (isLiveSynced) {
      try {
        liveDetails = await bolnaService.getBatchDetails(batchResult.batch_id);
      } catch {
        // Non-fatal
      }
    }

    const updates = {
      bolnaBatchId: batchResult.batch_id,
      bolnaBatchStatus: liveDetails?.status || batchResult.state || "created",
      callQueue: queue,
    };

    if (db && mongoose.Types.ObjectId.isValid(id)) {
      await Campaign.findByIdAndUpdate(id, { $set: updates });
    }
    const updated = updateCampaign(id, updates);

    return NextResponse.json({
      success: true,
      campaign: updated || { ...campaign, ...updates },
      batch: {
        batchId: batchResult.batch_id,
        status: updates.bolnaBatchStatus,
        mode: isLiveSynced ? "live_bolna" : "simulated_local",
        details: liveDetails,
        leadCount: queue.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Internal Server Error",
        details: error?.message || "Failed to sync campaign with Bolna AI.",
      },
      { status: 500 }
    );
  }
}
