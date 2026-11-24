import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import { requireOrganizationRole } from "@/lib/rbac";
import {
  getCampaigns,
  addCampaign,
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
import { ICampaign, ICampaignQueueItem, ILead } from "@/types";

export async function GET(req: NextRequest) {
  const rbac = requireOrganizationRole(req);
  if (!rbac.ok) return rbac.response;

  const orgId = rbac.organizationId;

  const db = await connectToDatabase();
  if (db) {
    const dbCamps = await Campaign.find({ organizationId: orgId })
      .sort({ createdAt: -1 })
      .lean();
    for (const c of dbCamps) {
      const normalized = { ...(c as any), _id: String((c as any)._id) };
      const existing = getCampaigns().find(
        (sc) => String(sc._id) === normalized._id
      );
      if (!existing) {
        addCampaign(normalized);
      } else {
        Object.assign(existing, normalized);
      }
    }
  }

  const allCalls = getCalls().filter(
    (c) => String(c.organizationId) === String(orgId)
  );
  const allLeads = getLeads().filter(
    (l) => String(l.organizationId) === String(orgId)
  );
  const campaigns = getCampaigns()
    .filter((c) => String(c.organizationId) === String(orgId))
    .map((camp) => {
      const metrics = computeCampaignMetrics(camp, allCalls, allLeads);
      return {
        ...camp,
        ...metrics,
      };
    });

  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  try {
    const rbac = requireOrganizationRole(req);
    if (!rbac.ok) return rbac.response;

    const { session, organizationId: orgId } = rbac;
    const body = await req.json();

    if (!body.name || String(body.name).trim().length < 2) {
      return NextResponse.json(
        { error: "Campaign name is required (min 2 characters)" },
        { status: 400 }
      );
    }
    if (!body.agentId) {
      return NextResponse.json(
        { error: "AI Agent selection is required" },
        { status: 400 }
      );
    }
    if (!body.objective || String(body.objective).trim().length < 2) {
      return NextResponse.json(
        { error: "Campaign Objective is required" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    let agent = getAgentById(body.agentId);
    if (!agent && db && mongoose.Types.ObjectId.isValid(body.agentId)) {
      const aDoc = await Agent.findById(body.agentId).lean();
      if (aDoc) agent = { ...(aDoc as any), _id: String((aDoc as any)._id) };
    }

    if (agent && String(agent.organizationId) !== String(orgId)) {
      return NextResponse.json(
        {
          error: "Cross-Tenant Access Denied",
          details: "Selected AI agent does not belong to your organization.",
        },
        { status: 403 }
      );
    }

    const campaignObjectId = new mongoose.Types.ObjectId().toHexString();
    const agentName = agent?.name || body.agentName || "AI Voice Agent";

    const enrolledLeadIds: string[] = [];
    const callQueue: ICampaignQueueItem[] = [];
    const seenPhonesInCampaign = new Set<string>();

    // 1. Pre-selected existing CRM leadIds belonging to this organization
    const existingLeadsInStore = getLeads().filter(
      (l) => String(l.organizationId) === String(orgId)
    );
    if (Array.isArray(body.leadIds)) {
      for (const lid of body.leadIds) {
        const found = existingLeadsInStore.find(
          (l) => String(l._id) === String(lid)
        );
        if (found && !found.doNotContact) {
          const phoneCheck = validateAndNormalizePhone(found.phone);
          if (
            phoneCheck.valid &&
            !seenPhonesInCampaign.has(phoneCheck.normalized)
          ) {
            seenPhonesInCampaign.add(phoneCheck.normalized);
            enrolledLeadIds.push(String(found._id));
            found.assignedAgentId = String(body.agentId);
            found.campaignId = campaignObjectId;
            callQueue.push({
              leadId: String(found._id),
              leadName: found.name,
              phoneNumber: phoneCheck.normalized,
              status: "queued",
              attempts: 0,
            });
          }
        }
      }
    }

    // 2. Process validated uploaded contacts
    const uploadedContacts = Array.isArray(body.uploadedContacts)
      ? body.uploadedContacts
      : [];

    let importedCount = 0;
    let duplicateSkipped = 0;
    let invalidSkipped = 0;

    for (const rawContact of uploadedContacts) {
      const rawPhone = String(
        rawContact.normalizedPhone || rawContact.phone || rawContact.rawPhone || ""
      ).trim();
      const phoneCheck = validateAndNormalizePhone(rawPhone);
      if (!phoneCheck.valid) {
        invalidSkipped += 1;
        continue;
      }

      const formattedPhone = phoneCheck.normalized;
      if (seenPhonesInCampaign.has(formattedPhone)) {
        duplicateSkipped += 1;
        continue;
      }

      let existingOrgLead = getLeads().find(
        (l) =>
          String(l.organizationId) === String(orgId) &&
          (l.phone === formattedPhone || l.phone === rawPhone)
      );

      if (!existingOrgLead && db) {
        const dbLead = await Lead.findOne({
          organizationId: orgId,
          $or: [{ phone: formattedPhone }, { phone: rawPhone }],
        }).lean();
        if (dbLead) {
          const loadedLead: ILead = {
            ...(dbLead as any),
            _id: String((dbLead as any)._id),
          };
          addLead(loadedLead);
          existingOrgLead = loadedLead;
        }
      }

      if (existingOrgLead) {
        seenPhonesInCampaign.add(formattedPhone);
        existingOrgLead.assignedAgentId = String(body.agentId);
        existingOrgLead.campaignId = campaignObjectId;
        if (rawContact.budget) existingOrgLead.budget = String(rawContact.budget);
        if (rawContact.customFields) {
          existingOrgLead.customFields = {
            ...(existingOrgLead.customFields || {}),
            ...rawContact.customFields,
          };
        }
        enrolledLeadIds.push(String(existingOrgLead._id));
        callQueue.push({
          leadId: String(existingOrgLead._id),
          leadName: existingOrgLead.name,
          phoneNumber: formattedPhone,
          status: "queued",
          attempts: 0,
        });
        importedCount += 1;

        if (db && mongoose.Types.ObjectId.isValid(existingOrgLead._id)) {
          await Lead.findByIdAndUpdate(existingOrgLead._id, {
            $set: {
              campaignId: campaignObjectId,
              assignedAgentId: String(body.agentId),
              customFields: existingOrgLead.customFields,
            },
          });
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
        budget: String(
          rawContact.budget || rawContact.customFields?.budget || ""
        ).trim(),
        industry: String(rawContact.industry || "General").trim(),
        source: `Campaign Upload: ${body.name}`,
        campaignId: campaignObjectId,
        assignedAgentId: String(body.agentId),
        customFields: {
          ...(rawContact.customFields || {}),
          ...(rawContact.budget ? { budget: rawContact.budget } : {}),
        },
        qualificationStatus: "new",
        interestLevel: "unknown",
        doNotContact: false,
        notes: rawContact.notes ? [String(rawContact.notes)] : [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      addLead(newLead);
      seenPhonesInCampaign.add(formattedPhone);
      enrolledLeadIds.push(leadObjectId);
      callQueue.push({
        leadId: leadObjectId,
        leadName: newLead.name,
        phoneNumber: formattedPhone,
        status: "queued",
        attempts: 0,
      });
      importedCount += 1;

      if (db) {
        try {
          await Lead.create({
            ...newLead,
            _id: new mongoose.Types.ObjectId(leadObjectId),
          });
        } catch {
          // Non-fatal duplicate key
        }
      }
    }

    const validationSummary = body.validationSummary || {
      totalUploaded: uploadedContacts.length,
      validRecords: importedCount,
      invalidRecords: invalidSkipped,
      duplicateRecords: duplicateSkipped,
      missingPhoneNumbers: 0,
      importedRecords: enrolledLeadIds.length,
    };

    const requestedStatus = String(body.status || "ready").toLowerCase();
    const initialStatus: ICampaign["status"] =
      requestedStatus === "draft"
        ? "draft"
        : requestedStatus === "scheduled"
        ? "scheduled"
        : "ready";

    // 3. Full Bolna AI Batch Synchronization (No silent failures)
    let bolnaBatchId: string | undefined = undefined;
    let bolnaBatchStatus = "unlinked";
    let bolnaSyncStatus: ICampaign["bolnaSyncStatus"] = "pending";
    let bolnaSyncError: string | null = null;
    let lastSyncedAt: Date | undefined = undefined;

    const targetBolnaAgentId = agent?.bolnaAgentId || "";

    if (callQueue.length > 0 && targetBolnaAgentId) {
      const batchCsvLines = ["contact_number,first_name,lead_id"];
      for (const qItem of callQueue) {
        const phone = normalizeIndianPhoneE164(qItem.phoneNumber);
        const safeName = (qItem.leadName || "Contact").replace(/["\n,]/g, " ");
        batchCsvLines.push(`${phone},${safeName},${qItem.leadId}`);
      }
      const batchCsvContent = batchCsvLines.join("\n");

      const batchResult = await bolnaService.createBatchCampaign({
        agentId: targetBolnaAgentId,
        csvContent: batchCsvContent,
        filename: `${String(body.name).replace(/[^a-zA-Z0-9]/g, "_")}.csv`,
        fromPhoneNumbers: body.outboundPhoneNumber
          ? [body.outboundPhoneNumber]
          : undefined,
      });

      if (batchResult.success && batchResult.batch_id) {
        bolnaBatchId = batchResult.batch_id;
        bolnaBatchStatus = batchResult.state || "created";
        bolnaSyncStatus = "synced";
        lastSyncedAt = new Date();

        if (requestedStatus === "scheduled" || requestedStatus === "running") {
          const schedRes = await bolnaService.scheduleBatchCampaign(
            batchResult.batch_id,
            body.scheduleStartDate
          );
          if (schedRes.success) {
            bolnaBatchStatus = schedRes.status || "scheduled";
          } else {
            bolnaSyncStatus = "needs_attention";
            bolnaSyncError = schedRes.error || "Failed to schedule batch on Bolna";
          }
        }
      } else {
        bolnaSyncStatus = "failed";
        bolnaSyncError =
          batchResult.error || "Bolna batch sync failed. Retry from campaign details.";
      }
    } else if (callQueue.length > 0 && !targetBolnaAgentId) {
      bolnaSyncStatus = "needs_attention";
      bolnaSyncError =
        "Selected agent is not linked to a Bolna Agent ID yet. Sync the agent first.";
    }

    const newCampaign: ICampaign = {
      _id: campaignObjectId,
      organizationId: orgId,
      name: String(body.name).trim(),
      description: body.description || "",
      objective: body.objective || "Lead Qualification",
      campaignType:
        String(body.objective || "lead_qualification")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_") || "lead_qualification",
      direction: body.direction || agent?.agentType || "outbound",
      agentId: String(body.agentId),
      agentName,
      bolnaBatchId,
      bolnaBatchStatus,
      bolnaSyncStatus,
      bolnaSyncError,
      lastSyncedAt,
      outboundPhoneNumber:
        body.outboundPhoneNumber ||
        agent?.callingConfiguration?.phoneNumber ||
        "",
      maxCallDurationSeconds: Number(
        body.maxCallDurationSeconds ||
          agent?.callingConfiguration?.maxDurationSeconds ||
          300
      ),
      leadIds: enrolledLeadIds,
      uploadedFileName: body.uploadedFileName || undefined,
      columnMapping: body.columnMapping || {},
      validationSummary,
      callQueue,
      concurrency: Number(body.concurrency || 2),
      startCondition: body.startCondition || "immediate",
      consentConfirmed: Boolean(body.consentConfirmed ?? true),
      totalLeads: enrolledLeadIds.length,
      eligibleLeads: enrolledLeadIds.length,
      queuedLeads: callQueue.length,
      callsInitiated: 0,
      callsAcceptedByBolna: 0,
      callsInProgress: 0,
      connectedCalls: 0,
      completedCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      noAnswerCalls: 0,
      qualifiedLeads: 0,
      remainingLeads: enrolledLeadIds.length,
      schedule: {
        startDate: new Date(body.scheduleStartDate || Date.now()),
        callingHours: {
          start: body.callingStartHour || "09:30",
          end: body.callingEndHour || "18:30",
        },
        timezone: body.timezone || "Asia/Kolkata",
      },
      maxRetries: Number(body.maxRetries ?? 2),
      retryIntervalMinutes: Number(body.retryIntervalMinutes ?? 60),
      priority: body.priority || "medium",
      status: initialStatus,
      createdBy: session.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addCampaign(newCampaign);

    if (db) {
      await Campaign.create({
        ...newCampaign,
        _id: new mongoose.Types.ObjectId(campaignObjectId),
      });
    }

    return NextResponse.json(
      {
        success: true,
        campaign: newCampaign,
        validationSummary,
        totalEnrolledLeads: enrolledLeadIds.length,
        bolnaSync: {
          synced: bolnaSyncStatus === "synced",
          status: bolnaSyncStatus,
          batchId: bolnaBatchId || null,
          error: bolnaSyncError,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to create campaign") },
      { status: 500 }
    );
  }
}
