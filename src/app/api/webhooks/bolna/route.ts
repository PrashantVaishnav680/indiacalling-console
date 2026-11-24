import { NextRequest, NextResponse } from "next/server";
import { formatErrorMessage } from "@/lib/error-formatter";
import mongoose from "mongoose";
import {
  bolnaService,
  normalizeBolnaStatus,
  parseBolnaTranscriptToMessages,
  extractBolnaQualification,
  evaluateLeadQualification,
  normalizeIndianPhoneE164,
} from "@/lib/bolna/client";
import { connectToDatabase } from "@/lib/db";
import WebhookEvent from "@/models/WebhookEvent";
import Call from "@/models/Call";
import Agent from "@/models/Agent";
import Lead from "@/models/Lead";
import UsageLedger from "@/models/UsageLedger";
import { deductCallUsageFromWallet } from "@/lib/wallet-billing";
import {
  getCallByBolnaId,
  upsertCallByExecutionId,
  addTranscript,
  updateLead,
  addAssignment,
  getAgentByBolnaId,
  getLeads,
  addLead,
} from "@/lib/store";
import { ICall, ILead, QualificationStatus } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const signature =
      req.headers.get("x-bolna-signature") ||
      req.headers.get("x-webhook-secret") ||
      req.headers.get("authorization");

    if (!bolnaService.validateWebhookSignature(signature)) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 }
      );
    }

    const payload = await req.json();
    const bolnaExecutionId = String(
      payload.id ||
        payload.execution_id ||
        payload.call_id ||
        payload.data?.id ||
        payload.data?.execution_id ||
        payload.data?.call_id ||
        ""
    );
    const rawStatus = String(
      payload.status || payload.event_type || payload.data?.status || "completed"
    );
    const normalizedStatus = normalizeBolnaStatus(rawStatus);

    // Deterministic eventId for idempotency per execution + status transition
    const eventId =
      payload.event_id ||
      (bolnaExecutionId
        ? `bolna_${bolnaExecutionId}_${normalizedStatus}`
        : `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

    const db = await connectToDatabase();
    if (db) {
      const existingEvent = await WebhookEvent.findOne({ eventId });
      if (existingEvent) {
        return NextResponse.json(
          { message: "Duplicate webhook event ignored (idempotent)", eventId },
          { status: 200 }
        );
      }

      await WebhookEvent.create({
        eventId,
        source: "bolna",
        eventType: normalizedStatus,
        payload,
        processed: true,
        processedAt: new Date(),
      });
    }

    if (bolnaExecutionId) {
      const normalizedExec = bolnaService.normalizeExecutionPayload(
        payload.data || payload
      );
      const extracted =
        normalizedExec.extracted_data || payload.extracted_data || {};
      const qualInfo = extractBolnaQualification(
        extracted,
        normalizedExec.summary || payload.summary
      );
      const isQualified = qualInfo.isQualified;

      const qualificationResult = {
        status: (isQualified ? "qualified" : "follow_up") as
          | "qualified"
          | "unqualified"
          | "follow_up",
        score: qualInfo.score,
        interestLevel: qualInfo.interestLevel,
        reason: qualInfo.reason,
        budget: qualInfo.budget,
        timeline: qualInfo.timeline,
      };

      // Resolve agent
      let matchedAgent = normalizedExec.agent_id
        ? getAgentByBolnaId(normalizedExec.agent_id)
        : undefined;
      if (!matchedAgent && db && normalizedExec.agent_id) {
        const agentDoc = await Agent.findOne({
          bolnaAgentId: normalizedExec.agent_id,
        }).lean();
        if (agentDoc) {
          matchedAgent = { ...(agentDoc as any), _id: String(agentDoc._id) };
        }
      }

      const existingStoreCall = getCallByBolnaId(bolnaExecutionId);
      const callId =
        existingStoreCall?._id || new mongoose.Types.ObjectId().toHexString();
      const orgId =
        existingStoreCall?.organizationId ||
        matchedAgent?.organizationId ||
        "org_default_01";

      const callRecord: ICall = {
        _id: callId,
        organizationId: orgId,
        agentId:
          existingStoreCall?.agentId ||
          matchedAgent?._id ||
          normalizedExec.agent_id ||
          "agent_bolna",
        agentName:
          existingStoreCall?.agentName ||
          matchedAgent?.name ||
          "Bolna Voice Agent",
        leadId: existingStoreCall?.leadId,
        leadName:
          existingStoreCall?.leadName ||
          (normalizedExec.direction === "web_call"
            ? "Browser Voice Tester"
            : `Contact (${String(normalizedExec.recipient_phone_number).slice(-4)})`),
        campaignId: existingStoreCall?.campaignId,
        direction: normalizedExec.direction || "outbound",
        status: normalizedStatus,
        bolnaCallId: bolnaExecutionId,
        bolnaExecutionId,
        phoneNumber:
          normalizedExec.recipient_phone_number ||
          existingStoreCall?.phoneNumber ||
          "Unknown",
        durationSeconds:
          normalizedExec.duration_seconds ||
          existingStoreCall?.durationSeconds ||
          0,
        cost: normalizedExec.total_cost || existingStoreCall?.cost || 0,
        startedAt:
          existingStoreCall?.startedAt ||
          (normalizedExec.created_at
            ? new Date(normalizedExec.created_at)
            : new Date()),
        endedAt:
          normalizedStatus === "completed" || normalizedStatus === "failed"
            ? new Date()
            : undefined,
        recordingUrl:
          normalizedExec.recording_url || existingStoreCall?.recordingUrl,
        transcript:
          normalizedExec.transcript_text || existingStoreCall?.transcript,
        callOutcome:
          normalizedStatus === "completed"
            ? isQualified
              ? "Qualified Lead"
              : "Completed"
            : normalizedStatus,
        qualificationStatus: qualificationResult.status,
        isSimulated: false,
        testingMode:
          normalizedExec.direction === "web_call"
            ? "browser_web_call"
            : "outbound_test_call",
        syncStatus: "synced",
        extractedData: extracted,
        qualificationResult,
        createdAt: existingStoreCall?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      upsertCallByExecutionId(callRecord);

      const messages = parseBolnaTranscriptToMessages(
        payload.data?.transcript ?? payload.transcript
      );
      if (messages.length > 0) {
        addTranscript({
          _id: `trans_${callId}`,
          organizationId: orgId,
          callId,
          agentId: callRecord.agentId,
          leadId: callRecord.leadId,
          summary: qualificationResult.reason,
          rawText: normalizedExec.transcript_text,
          messages,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Resolve or create Lead document for this call
      let activeLeadId = callRecord.leadId;
      const phoneVal = callRecord.phoneNumber;
      const isValidPhone =
        phoneVal && phoneVal !== "Unknown" && phoneVal !== "Browser Web-Call";

      if (!activeLeadId && isValidPhone) {
        if (db) {
          const foundDoc = await Lead.findOne({
            organizationId: orgId,
            phone: phoneVal,
          });
          if (foundDoc) activeLeadId = String(foundDoc._id);
        }
        if (!activeLeadId) {
          const inMemLead = getLeads().find(
            (l) =>
              String(l.organizationId) === String(orgId) && l.phone === phoneVal
          );
          if (inMemLead) activeLeadId = String(inMemLead._id);
        }
      }

      if (isValidPhone) {
        if (!activeLeadId) {
          activeLeadId = new mongoose.Types.ObjectId().toHexString();
        }
        callRecord.leadId = activeLeadId;

        const leadQualStatus: QualificationStatus =
          qualificationResult.status === "qualified"
            ? "qualified"
            : qualificationResult.status === "unqualified"
            ? "unqualified"
            : "follow_up_required";

        const leadName =
          qualInfo.customerName ||
          callRecord.leadName ||
          `Prospect (${phoneVal.slice(-4)})`;
        callRecord.leadName = leadName;

        const leadRecord: ILead = {
          _id: activeLeadId,
          organizationId: orgId,
          name: leadName,
          phone: phoneVal,
          company: qualInfo.location || "Residential Prospect",
          location: qualInfo.location || "India",
          city: qualInfo.location || "Indore",
          budget: qualInfo.budget,
          source: `Bolna AI Voice Call (${callRecord.agentName})`,
          assignedAgentId: callRecord.agentId,
          qualificationStatus: leadQualStatus,
          interestLevel: qualificationResult.interestLevel,
          qualificationScore: qualificationResult.score,
          qualificationReason: qualificationResult.reason,
          lastCallId: callId,
          lastCallDate: new Date(),
          doNotContact: false,
          notes: qualInfo.nextAction ? [`Next action: ${qualInfo.nextAction}`] : [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        addLead(leadRecord);

        if (db) {
          await Lead.findOneAndUpdate(
            { organizationId: orgId, phone: phoneVal },
            {
              $set: {
                ...leadRecord,
                _id: new mongoose.Types.ObjectId(activeLeadId),
              },
            },
            { upsert: true, new: true }
          );
        }

        if (qualificationResult.status === "qualified") {
          addAssignment({
            _id: `assign_${activeLeadId}`,
            organizationId: orgId,
            leadId: activeLeadId,
            leadName,
            salespersonId: "sales_rep_01",
            salespersonName: "Priya Sharma (Senior AE)",
            assignedBy: "bolna_webhook_auto_qualifier",
            assignmentMethod: "round_robin",
            status: "pending",
            assignedAt: new Date(),
            notes: `Auto-qualified via Bolna webhook: ${qualificationResult.reason}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      } else if (callRecord.leadId) {
        const leadQualStatus: QualificationStatus =
          qualificationResult.status === "qualified"
            ? "qualified"
            : qualificationResult.status === "unqualified"
            ? "unqualified"
            : "follow_up_required";

        updateLead(callRecord.leadId, {
          qualificationStatus: leadQualStatus,
          interestLevel: qualificationResult.interestLevel,
          qualificationScore: qualificationResult.score,
          qualificationReason: qualificationResult.reason,
          lastCallId: callId,
        });

        if (qualificationResult.status === "qualified") {
          addAssignment({
            _id: `assign_${Date.now()}`,
            organizationId: orgId,
            leadId: callRecord.leadId,
            leadName: callRecord.leadName || "Qualified Contact",
            salespersonId: "sales_rep_01",
            salespersonName: "Priya Sharma (Senior AE)",
            assignedBy: "bolna_webhook_auto_qualifier",
            assignmentMethod: "round_robin",
            status: "pending",
            assignedAt: new Date(),
            notes: `Auto-qualified via Bolna webhook: ${qualificationResult.reason}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      if (db) {
        await Call.findOneAndUpdate(
          { bolnaExecutionId },
          {
            $set: {
              ...callRecord,
              _id: mongoose.Types.ObjectId.isValid(callId)
                ? new mongoose.Types.ObjectId(callId)
                : new mongoose.Types.ObjectId(),
            },
          },
          { upsert: true, new: true }
        );

        if (callRecord.leadId && mongoose.Types.ObjectId.isValid(callRecord.leadId)) {
          await Lead.findByIdAndUpdate(callRecord.leadId, {
            qualificationStatus: qualificationResult.status,
            interestLevel: qualificationResult.interestLevel,
            qualificationScore: qualificationResult.score,
            qualificationReason: qualificationResult.reason,
            lastCallId: callId,
          });
        }

        if (normalizedStatus === "completed") {
          await UsageLedger.findOneAndUpdate(
            { bolnaExecutionId },
            {
              $set: {
                organizationId: orgId,
                bolnaExecutionId,
                eventType:
                  normalizedExec.direction === "web_call"
                    ? "web_call_test"
                    : "outbound_call",
                durationSeconds: callRecord.durationSeconds,
                cost: callRecord.cost || 0,
                isSimulated: false,
                recordedAt: new Date(),
              },
            },
            { upsert: true }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      processedEventId: eventId,
      bolnaExecutionId,
      status: normalizedStatus,
    });
  } catch (error: any) {
    console.error("Bolna webhook processing error:", error);
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Webhook processing error") },
      { status: 500 }
    );
  }
}
