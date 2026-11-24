import { requireOrganizationRole, assertTenantOwnership } from "@/lib/rbac";
import { formatErrorMessage } from "@/lib/error-formatter";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import {
  getCallById,
  getTranscript,
  updateCall,
  addTranscript,
  upsertCallByExecutionId,
} from "@/lib/store";
import { connectToDatabase } from "@/lib/db";
import Call from "@/models/Call";
import Transcript from "@/models/Transcript";
import { bolnaService, normalizeBolnaStatus } from "@/lib/bolna/client";
import { ICall } from "@/types";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  try {
    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams.id;
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    const db = await connectToDatabase();
    let call: ICall | null = null;
    let transcript: any = null;

    if (db) {
      let doc: any = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        doc = await Call.findById(id).lean();
      }
      if (!doc) {
        doc = await Call.findOne({
          $or: [{ bolnaExecutionId: id }, { bolnaCallId: id }],
        }).lean();
      }
      if (doc) {
        call = { ...(doc as unknown as ICall), _id: String(doc._id) };
        upsertCallByExecutionId(call);
        if (mongoose.Types.ObjectId.isValid(call._id)) {
          transcript = await Transcript.findOne({
            callId: new mongoose.Types.ObjectId(call._id),
          }).lean();
        }
      }
    }

    if (!call) {
      call = getCallById(id) || null;
    }
    if (!transcript && call) {
      transcript = getTranscript(call._id);
    }

    if (!call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const execId = call.bolnaExecutionId || call.bolnaCallId;
    const shouldPollBolna =
      !bolnaService.isMockMode &&
      !call.isSimulated &&
      execId &&
      !execId.startsWith("sim_") &&
      (forceRefresh ||
        call.status === "queued" ||
        call.status === "initiated" ||
        call.status === "ringing" ||
        call.status === "in_progress" ||
        !call.transcript ||
        (call.status === "completed" && !call.recordingUrl));

    if (shouldPollBolna && execId) {
      try {
        const details = await bolnaService.getCallDetails(execId);
        if (details) {
          const updates: Partial<ICall> = {
            status: normalizeBolnaStatus(details.status),
            durationSeconds: details.duration_seconds || call.durationSeconds,
            cost: details.total_cost ?? call.cost,
            recordingUrl: details.recording_url || call.recordingUrl,
            transcript: details.transcript_text || call.transcript,
            extractedData: details.extracted_data || call.extractedData,
            syncStatus: "synced",
          };
          Object.assign(call, updates);
          updateCall(call._id, updates);

          if (db && mongoose.Types.ObjectId.isValid(call._id)) {
            await Call.findByIdAndUpdate(call._id, { $set: updates });
          }

          if (details.transcript && details.transcript.length > 0) {
            transcript = {
              _id: `trans_${call._id}`,
              organizationId: call.organizationId,
              callId: call._id,
              agentId: call.agentId,
              leadId: call.leadId,
              summary:
                details.summary ||
                "Conversation completed via Bolna AI telephony.",
              rawText: details.transcript_text,
              messages: details.transcript.map((m: any) => ({
                speaker: m.speaker,
                text: m.text || "",
                timestamp: m.timestamp ? String(m.timestamp) : "00:00",
              })),
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            addTranscript(transcript);
          }
        }
      } catch (syncErr: any) {
        console.warn("Live execution refresh warning:", syncErr?.message);
      }
    }

    return NextResponse.json({
      call,
      transcript: transcript || {
        _id: `trans_${call._id}`,
        callId: call._id,
        summary:
          call.status === "completed"
            ? call.qualificationResult?.reason || "Conversation concluded."
            : "Call execution is in progress...",
        messages: [],
      },
      recording: {
        available: Boolean(call.recordingUrl),
        url: `/api/calls/${call._id}/recording`,
        proxyUrl: `/api/calls/${call._id}/recording`,
        rawUrl: call.recordingUrl,
        format: call.recordingUrl?.endsWith(".mp3") ? "audio/mpeg" : "audio/ogg",
        duration: call.durationSeconds || 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to fetch call details") },
      { status: 500 }
    );
  }
}
