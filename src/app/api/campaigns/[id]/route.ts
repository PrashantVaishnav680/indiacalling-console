import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireOrganizationRole, assertTenantOwnership } from "@/lib/rbac";
import {
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  getLeads,
  addLead,
  getCalls,
  getAgentById,
} from "@/lib/store";
import { connectToDatabase } from "@/lib/db";
import Campaign from "@/models/Campaign";
import Lead from "@/models/Lead";
import Agent from "@/models/Agent";
import { validateAndNormalizePhone } from "@/lib/spreadsheet-parser";
import { computeCampaignMetrics } from "@/lib/analytics-counters";
import { bolnaService, normalizeIndianPhoneE164 } from "@/lib/bolna/client";
import { ILead } from "@/types";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const resolvedParams = await Promise.resolve(context.params);
  const id = resolvedParams.id;
  const orgId = rbac.organizationId;

  const db = await connectToDatabase();
  let campaign: any = getCampaignById(id);

  if (db && mongoose.Types.ObjectId.isValid(id)) {
    const dbCamp = await Campaign.findById(id).lean();
    if (dbCamp) {
      campaign = { ...dbCamp, _id: String((dbCamp as any)._id) };
    }
  }

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const tenantError = assertTenantOwnership(orgId, campaign.organizationId);
  if (tenantError) return tenantError;

  const allCalls = getCalls().filter(
    (c) => String(c.organizationId) === String(orgId)
  );
  const allLeads = getLeads().filter(
    (l) => String(l.organizationId) === String(orgId)
  );

  const metrics = computeCampaignMetrics(campaign, allCalls, allLeads);

  const campaignCalls = allCalls.filter(
    (c) => String(c.campaignId) === String(campaign._id)
  );
  const updatedQueue = (campaign.callQueue || []).map((qItem: any) => {
    const matchingCall = campaignCalls.find(
      (c) =>
        String(c.leadId) === String(qItem.leadId) ||
        c.phoneNumber === qItem.phoneNumber
    );
    if (!matchingCall) return qItem;
    return {
      ...qItem,
      status: matchingCall.status,
      bolnaExecutionId:
        matchingCall.bolnaExecutionId ||
        matchingCall.bolnaCallId ||
        qItem.bolnaExecutionId,
      callId: matchingCall._id,
      qualified:
        matchingCall.qualificationResult?.status === "qualified" ||
        matchingCall.qualificationStatus === "qualified",
    };
  });

  return NextResponse.json({
    ...campaign,
    ...metrics,
    callQueue: updatedQueue,
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const resolvedParams = await Promise.resolve(context.params);
  const id = resolvedParams.id;
  const orgId = rbac.organizationId;
  const body = await req.json();
  const db = await connectToDatabase();

  let existing: any = getCampaignById(id);
  if (!existing && db && mongoose.Types.ObjectId.isValid(id)) {
    const doc = await Campaign.findById(id).lean();
    if (doc) existing = { ...doc, _id: String((doc as any)._id) };
  }

  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const tenantError = assertTenantOwnership(orgId, existing.organizationId);
  if (tenantError) return tenantError;

  const currentLeadIds = [...(existing.leadIds || [])];
  const currentQueue = [...(existing.callQueue || [])];
  const seenPhones = new Set(currentQueue.map((q) => q.phoneNumber));
  let contactsModified = false;

  if (Array.isArray(body.uploadedContacts) && body.uploadedContacts.length > 0) {
    for (const rawContact of body.uploadedContacts) {
      const rawPhone = String(
        rawContact.normalizedPhone || rawContact.phone || rawContact.rawPhone || ""
      ).trim();
      const phoneCheck = validateAndNormalizePhone(rawPhone);
      if (!phoneCheck.valid) continue;

      const formattedPhone = phoneCheck.normalized;
      if (seenPhones.has(formattedPhone)) continue;

      const existingLead = getLeads().find(
        (l) =>
          String(l.organizationId) === String(orgId) &&
          (l.phone === formattedPhone || l.phone === rawPhone)
      );
      if (existingLead) {
        if (!currentLeadIds.includes(existingLead._id)) {
          currentLeadIds.push(existingLead._id);
          currentQueue.push({
            leadId: existingLead._id,
            leadName: existingLead.name,
            phoneNumber: formattedPhone,
            status: "queued",
            attempts: 0,
          });
          seenPhones.add(formattedPhone);
          contactsModified = true;
        }
        continue;
      }

      const leadObjectId = new mongoose.Types.ObjectId().toHexString();
      const newLead: ILead = {
        _id: leadObjectId,
        organizationId: orgId,
        name: String(
          rawContact.name || `Contact (${formattedPhone.slice(-4)})`
        ).trim(),
        phone: formattedPhone,
        email: String(rawContact.email || "").trim(),
        company: String(rawContact.company || "").trim(),
        location: String(rawContact.city || rawContact.location || "India").trim(),
        city: String(rawContact.city || rawContact.location || "India").trim(),
        budget: String(rawContact.budget || "").trim(),
        industry: String(rawContact.industry || "General").trim(),
        source: `Campaign Upload: ${existing.name || id}`,
        campaignId: id,
        assignedAgentId: body.agentId || existing.agentId,
        customFields: rawContact.customFields || {},
        qualificationStatus: "new",
        interestLevel: "unknown",
        doNotContact: false,
        notes: rawContact.notes ? [String(rawContact.notes)] : [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      addLead(newLead);
      currentLeadIds.push(leadObjectId);
      currentQueue.push({
        leadId: leadObjectId,
        leadName: newLead.name,
        phoneNumber: formattedPhone,
        status: "queued",
        attempts: 0,
      });
      seenPhones.add(formattedPhone);
      contactsModified = true;

      if (db) {
        try {
          await Lead.create({
            ...newLead,
            _id: new mongoose.Types.ObjectId(leadObjectId),
          });
        } catch {
          // Ignore duplicate
        }
      }
    }

    body.leadIds = currentLeadIds;
    body.callQueue = currentQueue;
    body.totalLeads = currentLeadIds.length;
    delete body.uploadedContacts;
  }

  if (body.status === "completed") {
    body.completedAt = new Date();
  }

  // Full Bolna Batch synchronization on update, start/schedule, or pause/stop
  const bolnaSync: {
    synced: boolean;
    action: string;
    batchId: string | null;
    error: string | null;
  } = {
    synced: true,
    action: "none",
    batchId: existing.bolnaBatchId || null,
    error: null,
  };

  const agentChanged =
    Boolean(body.agentId) && String(body.agentId) !== String(existing.agentId);
  const forceResync = Boolean(body.resyncBolna);
  delete body.resyncBolna;

  // 1. Re-create Bolna batch if contacts changed, agent changed, or explicit resync requested
  if ((contactsModified || agentChanged || forceResync) && currentQueue.length > 0) {
    const targetAgentId = body.agentId || existing.agentId;
    let agent = getAgentById(targetAgentId);
    if (!agent && db && mongoose.Types.ObjectId.isValid(targetAgentId)) {
      const aDoc = await Agent.findById(targetAgentId).lean();
      if (aDoc) agent = { ...(aDoc as any), _id: String((aDoc as any)._id) };
    }

    if (agent?.bolnaAgentId) {
      const batchCsvLines = ["contact_number,first_name,lead_id"];
      for (const qItem of currentQueue) {
        const phone = normalizeIndianPhoneE164(qItem.phoneNumber);
        const safeName = (qItem.leadName || "Contact").replace(/["\n,]/g, " ");
        batchCsvLines.push(`${phone},${safeName},${qItem.leadId}`);
      }

      const createRes = await bolnaService.createBatchCampaign({
        agentId: agent.bolnaAgentId,
        csvContent: batchCsvLines.join("\n"),
        filename: `${String(body.name || existing.name).replace(/[^a-zA-Z0-9]/g, "_")}.csv`,
      });

      if (createRes.success && createRes.batch_id) {
        if (existing.bolnaBatchId && existing.bolnaBatchId !== createRes.batch_id) {
          await bolnaService.deleteBatchCampaign(existing.bolnaBatchId);
        }
        body.bolnaBatchId = createRes.batch_id;
        body.bolnaBatchStatus = createRes.state || "created";
        body.bolnaSyncStatus = "synced";
        body.bolnaSyncError = null;
        body.lastSyncedAt = new Date();
        bolnaSync.action = "recreated_batch";
        bolnaSync.batchId = createRes.batch_id;
      } else {
        body.bolnaSyncStatus = "failed";
        body.bolnaSyncError = createRes.error || "Bolna batch update failed";
        bolnaSync.synced = false;
        bolnaSync.action = "recreate_failed";
        bolnaSync.error = body.bolnaSyncError;
      }
    }
  }

  // 2. Start / Schedule or Pause / Stop on Bolna
  const activeBatchId = body.bolnaBatchId || existing.bolnaBatchId;
  if (body.status === "running" || body.status === "scheduled") {
    if (activeBatchId) {
      const schedRes = await bolnaService.scheduleBatchCampaign(
        activeBatchId,
        body.scheduleStartDate
      );
      if (schedRes.success) {
        body.bolnaBatchStatus = schedRes.status || "scheduled";
        body.bolnaSyncStatus = "synced";
        body.bolnaSyncError = null;
        body.lastSyncedAt = new Date();
        bolnaSync.action = "scheduled";
        bolnaSync.batchId = activeBatchId;
      } else {
        body.bolnaSyncStatus = "failed";
        body.bolnaSyncError = schedRes.error || "Failed to start/schedule batch on Bolna";
        bolnaSync.synced = false;
        bolnaSync.action = "schedule_failed";
        bolnaSync.error = body.bolnaSyncError;
      }
    }
  } else if (body.status === "paused" || body.status === "cancelled") {
    if (activeBatchId) {
      const stopRes = await bolnaService.stopBatchCampaign(activeBatchId);
      if (stopRes.success) {
        body.bolnaBatchStatus = "stopped";
        body.bolnaSyncStatus = "synced";
        body.bolnaSyncError = null;
        body.lastSyncedAt = new Date();
        bolnaSync.action = "stopped";
        bolnaSync.batchId = activeBatchId;
      } else {
        body.bolnaSyncStatus = "failed";
        body.bolnaSyncError = stopRes.error || "Failed to stop batch on Bolna";
        bolnaSync.synced = false;
        bolnaSync.action = "stop_failed";
        bolnaSync.error = body.bolnaSyncError;
      }
    }
  }

  let updatedDoc: any = null;
  if (db && mongoose.Types.ObjectId.isValid(id)) {
    updatedDoc = await Campaign.findByIdAndUpdate(
      id,
      { $set: body },
      { new: true }
    ).lean();
  }
  const updated = updateCampaign(id, body);
  return NextResponse.json({
    success: true,
    campaign: updatedDoc ? { ...updatedDoc, _id: String(updatedDoc._id) } : updated,
    updated,
    bolnaSync,
  });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const resolvedParams = await Promise.resolve(context.params);
  const id = resolvedParams.id;
  const orgId = rbac.organizationId;
  const db = await connectToDatabase();

  let existing: any = getCampaignById(id);
  if (!existing && db && mongoose.Types.ObjectId.isValid(id)) {
    const doc = await Campaign.findById(id).lean();
    if (doc) existing = { ...doc, _id: String((doc as any)._id) };
  }

  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const tenantError = assertTenantOwnership(orgId, existing.organizationId);
  if (tenantError) return tenantError;

  // Delete associated Bolna Batch cleanly before removing local MongoDB record
  let bolnaDeleteRes: { success: boolean; error?: string } = { success: true };
  if (existing.bolnaBatchId) {
    bolnaDeleteRes = await bolnaService.deleteBatchCampaign(existing.bolnaBatchId);
  }

  if (db && mongoose.Types.ObjectId.isValid(id)) {
    await Campaign.findByIdAndDelete(id);
  }
  deleteCampaign(id);

  return NextResponse.json({
    success: true,
    message: bolnaDeleteRes.success
      ? "Campaign deleted from Console and Bolna."
      : "Campaign deleted locally, but Bolna deletion returned a warning.",
    bolnaSync: {
      synced: bolnaDeleteRes.success,
      error: bolnaDeleteRes.error || null,
    },
  });
}
