import { requireOrganizationRole, assertTenantOwnership } from "@/lib/rbac";
import { formatErrorMessage } from "@/lib/error-formatter";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSessionFromRequest, normalizeUserRole, isAuthorizedRole } from "@/lib/auth";
import {
  getCalls,
  upsertCallByExecutionId,
  addTranscript,
  getAgents,
  getAgentById,
  getLeads,
  getOrganizationById,
} from "@/lib/store";
import { initiateCallSchema } from "@/schemas";
import {
  bolnaService,
  normalizeBolnaStatus,
  normalizeIndianPhoneE164,
} from "@/lib/bolna/client";
import { connectToDatabase } from "@/lib/db";
import Agent from "@/models/Agent";
import Call from "@/models/Call";
import Organization from "@/models/Organization";
import UsageLedger from "@/models/UsageLedger";
import { syncBolnaAgentsAndCalls } from "@/lib/bolna/sync-service";
import { ICall } from "@/types";

export async function GET(req: NextRequest) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  try {
    const session = getSessionFromRequest(req);
    const orgId = session?.organizationId || "org_default_01";
    const role = normalizeUserRole(session?.role);
    const isSuperAdmin = role === "super_admin";

    const { searchParams } = new URL(req.url);
    const direction = searchParams.get("direction");
    const status = searchParams.get("status");
    const agentId = searchParams.get("agentId");
    const campaignId = searchParams.get("campaignId");
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");
    const shouldSync = searchParams.get("sync") === "true";
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(
      200,
      Math.max(1, Number(searchParams.get("pageSize") || 50))
    );

    // Automatically sync Bolna executions when requested OR when live API key is configured
    // (throttled cleanly to avoid redundant rapid polling)
    const lastSyncTs = (global as any).__LAST_BOLNA_CALL_SYNC__?.[orgId] || 0;
    const shouldAutoSync = shouldSync || Date.now() - lastSyncTs > 15000;
    if (shouldAutoSync && !bolnaService.isMockMode) {
      if (!(global as any).__LAST_BOLNA_CALL_SYNC__) {
        (global as any).__LAST_BOLNA_CALL_SYNC__ = {};
      }
      (global as any).__LAST_BOLNA_CALL_SYNC__[orgId] = Date.now();
      await syncBolnaAgentsAndCalls({
        organizationId: orgId,
        targetAgentId: agentId && agentId !== "all" ? agentId : undefined,
        syncAgents: true,
        syncCalls: true,
      });
    }

    const db = await connectToDatabase();
    if (db) {
      const dbCalls = await Call.find(
        isSuperAdmin ? {} : { organizationId: orgId }
      )
        .sort({ startedAt: -1, createdAt: -1 })
        .lean();

      for (const doc of dbCalls) {
        upsertCallByExecutionId({
          ...(doc as unknown as ICall),
          _id: String(doc._id),
        });
      }
    }

    // Strictly scope Call History & Recordings to THIS organization owned AI agents
    let orgAgentsForScope = getAgents().filter((a: any) => String(a.organizationId) === orgId);
    if (db) {
      const dbOrgAgents = await Agent.find({ organizationId: orgId }).select("_id bolnaAgentId").lean();
      if (dbOrgAgents.length > 0) {
        orgAgentsForScope = dbOrgAgents.map((a: any) => ({ ...a, _id: String(a._id) })) as any;
      }
    }
    const allowedAgentIds = new Set(orgAgentsForScope.map((a: any) => String(a._id)));
    const allowedBolnaAgentIds = new Set(
      orgAgentsForScope.map((a: any) => String(a.bolnaAgentId || "")).filter(Boolean)
    );

    let calls = [...getCalls()]
      .filter((c) => {
        if (String(c.organizationId) !== orgId) return false;
        if (allowedAgentIds.size === 0) return false;
        return (
          allowedAgentIds.has(String(c.agentId || "")) ||
          (c.bolnaAgentId && allowedBolnaAgentIds.has(String(c.bolnaAgentId)))
        );
      })
      .sort(
        (a, b) =>
          new Date(b.startedAt || b.createdAt).getTime() -
          new Date(a.startedAt || a.createdAt).getTime()
      );

    // Organization users see all calls strictly scoped to their own organizationId (no legacy sales_rep hiding)

    if (direction && direction !== "all") {
      calls = calls.filter((c) => c.direction === direction);
    }
    if (status && status !== "all") {
      calls = calls.filter((c) => c.status === status);
    }
    if (agentId && agentId !== "all") {
      calls = calls.filter(
        (c) => String(c.agentId) === agentId || c.agentName === agentId
      );
    }
    if (campaignId && campaignId !== "all") {
      calls = calls.filter((c) => String(c.campaignId) === campaignId);
    }
    if (fromDate) {
      const fromTs = new Date(fromDate).getTime();
      if (!isNaN(fromTs)) {
        calls = calls.filter(
          (c) => new Date(c.startedAt || c.createdAt).getTime() >= fromTs
        );
      }
    }
    if (toDate) {
      const toTs = new Date(toDate).getTime() + 86400000;
      if (!isNaN(toTs)) {
        calls = calls.filter(
          (c) => new Date(c.startedAt || c.createdAt).getTime() <= toTs
        );
      }
    }
    if (search) {
      calls = calls.filter(
        (c) =>
          (c.leadName || "").toLowerCase().includes(search) ||
          (c.phoneNumber || "").toLowerCase().includes(search) ||
          (c.agentName || "").toLowerCase().includes(search) ||
          (c.bolnaExecutionId || "").toLowerCase().includes(search) ||
          (c.bolnaCallId || "").toLowerCase().includes(search) ||
          (c.callOutcome || "").toLowerCase().includes(search)
      );
    }

    const total = calls.length;
    const paginatedCalls = calls.slice((page - 1) * pageSize, page * pageSize);

    return NextResponse.json({
      calls: paginatedCalls,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      bolnaMode: bolnaService.isMockMode ? "unconfigured" : "live",
    });
  } catch (error: any) {
    return NextResponse.json(
      { calls: getCalls(), total: getCalls().length, error: error?.message },
      { status: 200 }
    );
  }
}

export async function POST(req: NextRequest) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const validated = initiateCallSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const {
      agentId,
      phoneNumber,
      fromPhoneNumber,
      leadId,
      campaignId,
      direction,
      testingMode = "outbound_test_call",
      confirmedRealCall,
      bolnaExecutionId: providedExecutionId,
    } = validated.data;

    // STRICT REQUIREMENT (Section 7): Never run a simulated demo call or generate fake recordings/transcripts.
    if ((testingMode as string) === "simulated") {
      return NextResponse.json(
        {
          error: "Simulated Demo Mode Disabled",
          details:
            "Simulated demo calls have been removed. Please initiate a real Bolna test call using a synchronized Bolna AI agent.",
        },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    let agent = getAgentById(agentId);
    if (!agent && db && mongoose.Types.ObjectId.isValid(agentId)) {
      const doc = await Agent.findById(agentId).lean();
      if (doc) agent = { ...(doc as any), _id: String(doc._id) };
    }

    if (!agent) {
      return NextResponse.json(
        { error: "Agent Not Found", details: "Selected agent does not exist." },
        { status: 404 }
      );
    }

    const hasSyncedBolnaId =
      Boolean(agent.bolnaAgentId) &&
      !String(agent.bolnaAgentId).startsWith("bolna_sim_") &&
      !String(agent.bolnaAgentId).startsWith("bolna_agent_");

    if (!hasSyncedBolnaId || agent.syncStatus !== "synced") {
      return NextResponse.json(
        {
          error: "Agent Not Synchronized With Bolna",
          details: `Agent "${agent.name}" is not synchronized with Bolna AI yet (current status: ${
            agent.syncStatus || "pending"
          }). Synchronize the agent with Bolna AI before initiating a real test call.`,
        },
        { status: 400 }
      );
    }

    if (bolnaService.isMockMode) {
      return NextResponse.json(
        {
          error: "Bolna API Key Not Configured",
          details:
            "Cannot initiate a real Bolna test call because BOLNA_API_KEY is not configured in .env.local. Simulated call fallback is disabled.",
        },
        { status: 502 }
      );
    }

    const agentName = agent.name;
    const orgId = session.organizationId || "org_default_01";
    const isSuper = false;
    if (!isSuper) {
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
              "Calling functionality is disabled because this organization is currently suspended.",
          },
          { status: 403 }
        );
      }
    }
    const callObjectId = new mongoose.Types.ObjectId().toHexString();

    // Real Browser Web-Call Execution Persistence (when @bolna/web-call completes with a real run_id)
    if (testingMode === "browser_web_call") {
      if (!providedExecutionId) {
        return NextResponse.json(
          {
            error: "Missing Bolna Execution ID",
            details:
              "A real Bolna Web-Call run_id is required to record a browser voice execution.",
          },
          { status: 400 }
        );
      }

      const remoteDetails = await bolnaService.getCallDetails(
        providedExecutionId
      );

      const webCallRecord: ICall = {
        _id: callObjectId,
        organizationId: orgId,
        agentId: agent._id,
        bolnaAgentId: agent.bolnaAgentId,
        agentName,
        leadName: "Browser Web-Call Session",
        direction: "web_call",
        status: normalizeBolnaStatus(remoteDetails.status),
        acceptedByBolna: true,
        bolnaCallId: providedExecutionId,
        bolnaExecutionId: providedExecutionId,
        phoneNumber: "Browser Web-Call",
        durationSeconds: remoteDetails.duration_seconds || 0,
        cost: remoteDetails.total_cost || 0,
        startedAt: remoteDetails.created_at
          ? new Date(remoteDetails.created_at)
          : new Date(),
        endedAt: remoteDetails.ended_at
          ? new Date(remoteDetails.ended_at)
          : new Date(),
        recordingUrl: remoteDetails.recording_url,
        transcript: remoteDetails.transcript_text,
        callOutcome: remoteDetails.status,
        qualificationStatus: "pending",
        isSimulated: false,
        testingMode: "browser_web_call",
        syncStatus: "synced",
        extractedData: remoteDetails.extracted_data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const { call: savedCall } = upsertCallByExecutionId(webCallRecord);

      if (remoteDetails.transcript && remoteDetails.transcript.length > 0) {
        addTranscript({
          _id: `trans_${savedCall._id}`,
          organizationId: orgId,
          callId: savedCall._id,
          agentId: savedCall.agentId,
          summary: remoteDetails.summary || "",
          messages: remoteDetails.transcript.map((m) => ({
            speaker: m.speaker,
            text: m.text,
            timestamp: m.timestamp ? String(m.timestamp) : undefined,
          })),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      if (db) {
        await Call.findOneAndUpdate(
          { bolnaExecutionId: providedExecutionId },
          {
            $set: {
              ...webCallRecord,
              _id: new mongoose.Types.ObjectId(savedCall._id),
            },
          },
          { upsert: true, new: true }
        );
      }

      return NextResponse.json(
        {
          success: true,
          call: savedCall,
          bolnaCallId: providedExecutionId,
          bolnaExecutionId: providedExecutionId,
          mode: "live_bolna",
        },
        { status: 201 }
      );
    }

    // Real Bolna Outbound Call Initiation (`POST /call`)
    if (!confirmedRealCall) {
      return NextResponse.json(
        {
          error: "Confirmation Required",
          details:
            "Initiating a real Bolna outbound call may incur actual Bolna charges and requires explicit confirmation (confirmedRealCall: true).",
        },
        { status: 400 }
      );
    }

    const formattedPhone = normalizeIndianPhoneE164(phoneNumber);

    let bolnaResponse;
    try {
      bolnaResponse = await bolnaService.initiateCall({
        agent_id: agent.bolnaAgentId!,
        recipient_phone_number: formattedPhone,
        from_phone_number:
          fromPhoneNumber || agent.callingConfiguration?.phoneNumber || undefined,
        user_data: {
          organization_id: orgId,
          campaign_id: campaignId,
          lead_id: leadId,
          agent_name: agentName,
        },
      });
    } catch (bolnaErr: any) {
      console.error("Bolna outbound call initiation error:", bolnaErr);
      return NextResponse.json(
        {
          error: "Bolna Outbound Call Failed",
          details:
            bolnaErr?.message ||
            "Failed to initiate real outbound call via Bolna AI.",
        },
        { status: 502 }
      );
    }

    const execId = bolnaResponse.execution_id || bolnaResponse.call_id;
    let existingLead = getLeads().find(
      (l) => l.phone === phoneNumber || l.phone === formattedPhone
    );
    if (!existingLead && leadId) {
      existingLead = getLeads().find((l) => String(l._id) === leadId);
    }
    const leadName = existingLead
      ? existingLead.name
      : body.leadName || `Contact (${formattedPhone.slice(-4)})`;

    const newCall: ICall = {
      _id: callObjectId,
      organizationId: orgId,
      agentId: agent._id,
      bolnaAgentId: agent.bolnaAgentId,
      agentName,
      leadId: existingLead?._id,
      leadName,
      campaignId: campaignId || undefined,
      direction: direction || "outbound",
      status: "initiated",
      acceptedByBolna: true,
      bolnaCallId: execId,
      bolnaExecutionId: execId,
      phoneNumber: formattedPhone,
      durationSeconds: 0,
      cost: 0,
      startedAt: new Date(),
      callOutcome: "Accepted by Bolna AI",
      qualificationStatus: "pending",
      isSimulated: false,
      testingMode: "outbound_test_call",
      syncStatus: "synced",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { call: storedCall } = upsertCallByExecutionId(newCall);

    if (db) {
      try {
        await Call.findOneAndUpdate(
          { bolnaExecutionId: execId },
          {
            $set: {
              ...newCall,
              _id: new mongoose.Types.ObjectId(storedCall._id),
            },
          },
          { upsert: true, new: true }
        );
        await UsageLedger.findOneAndUpdate(
          { bolnaExecutionId: execId },
          {
            $set: {
              organizationId: orgId,
              bolnaExecutionId: execId,
              eventType: "outbound_call",
              durationSeconds: 0,
              cost: 0,
              isSimulated: false,
              recordedAt: new Date(),
            },
          },
          { upsert: true }
        );
      } catch (dbErr: any) {
        console.warn("Outbound call MongoDB persist warning:", dbErr?.message);
      }
    }

    return NextResponse.json(
      {
        success: true,
        call: storedCall,
        bolnaCallId: execId,
        bolnaExecutionId: execId,
        mode: "live_bolna",
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Initiate call error:", error);
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to initiate call") },
      { status: 500 }
    );
  }
}
