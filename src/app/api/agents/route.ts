import { requireOrganizationRole, assertTenantOwnership } from "@/lib/rbac";
import { formatErrorMessage } from "@/lib/error-formatter";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSessionFromRequest, isAuthorizedRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import Agent from "@/models/Agent";
import KnowledgeBase from "@/models/KnowledgeBase";
import Call from "@/models/Call";
import Lead from "@/models/Lead";
import Campaign from "@/models/Campaign";
import {
  getAgents,
  addAgent,
  upsertAgentByBolnaId,
  getCalls,
  getLeads,
  getCampaigns,
  getKnowledgeBases,
} from "@/lib/store";
import { bolnaService, resolveIsoLanguageCode } from "@/lib/bolna/client";
import { computeAgentMetrics } from "@/lib/analytics-counters";
import {
  extractAgentFieldsFromBolnaRemote,
  syncBolnaAgentsAndCalls,
} from "@/lib/bolna/sync-service";
import { buildKnowledgeBaseContextForAgent } from "@/lib/knowledge-processor";
import { IAgent } from "@/types";

export async function GET(req: NextRequest) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = session.organizationId || "org_default_01";
    const isSuperAdmin = false;
    const { searchParams } = new URL(req.url);
    const shouldSyncBolna = searchParams.get("sync") === "true";
    const requestedOrgId = searchParams.get("organizationId");

    const db = await connectToDatabase();

    const query = isSuperAdmin
      ? requestedOrgId
        ? { organizationId: requestedOrgId }
        : {}
      : { organizationId: orgId };

    let dbAgents: any[] = [];
    if (db) {
      dbAgents = await Agent.find(query).sort({ createdAt: -1 }).lean();
    }

    if (
      (shouldSyncBolna || dbAgents.length === 0) &&
      !bolnaService.isMockMode
    ) {
      try {
        await syncBolnaAgentsAndCalls({
          organizationId: orgId,
          syncAgents: true,
          syncCalls: true,
        });
        if (db) {
          dbAgents = await Agent.find(query).sort({ createdAt: -1 }).lean();
        }
      } catch (syncErr: any) {
        console.warn("Bolna sync warning:", syncErr?.message);
      }
    }

    if (db && dbAgents.length > 0) {
      for (const doc of dbAgents) {
        const isRealBolnaId =
          doc.bolnaAgentId &&
          !String(doc.bolnaAgentId).startsWith("bolna_sim_") &&
          !String(doc.bolnaAgentId).startsWith("bolna_agent_");
        const agentObj: IAgent = {
          ...(doc as any),
          _id: String(doc._id),
          syncStatus: isRealBolnaId
            ? doc.syncStatus || "synced"
            : doc.syncStatus === "failed"
            ? "failed"
            : "pending",
        };
        upsertAgentByBolnaId(agentObj);
      }
    }

    let allCalls: any[] = getCalls();
    let allLeads: any[] = getLeads();
    let allCampaigns: any[] = getCampaigns();

    if (db) {
      try {
        const [dbCalls, dbLeads, dbCamps] = await Promise.all([
          Call.find({}).lean(),
          Lead.find({}).lean(),
          Campaign.find({}).lean(),
        ]);
        if (dbCalls.length > 0) {
          allCalls = dbCalls.map((c: any) => ({ ...c, _id: String(c._id) }));
        }
        if (dbLeads.length > 0) {
          allLeads = dbLeads.map((l: any) => ({ ...l, _id: String(l._id) }));
        }
        if (dbCamps.length > 0) {
          allCampaigns = dbCamps.map((c: any) => ({ ...c, _id: String(c._id) }));
        }
      } catch {
        // Fallback to in-memory store
      }
    }

    const baseAgents =
      db && dbAgents.length > 0
        ? dbAgents.map((a: any) => ({ ...a, _id: String(a._id) }))
        : getAgents();

    const scopedAgents = baseAgents
      .filter((a: any) => {
        if (isSuperAdmin) {
          return requestedOrgId
            ? String(a.organizationId) === String(requestedOrgId)
            : true;
        }
        return String(a.organizationId) === String(orgId);
      })
      .map((agent: any) => {
        const isRealBolnaId =
          agent.bolnaAgentId &&
          !String(agent.bolnaAgentId).startsWith("bolna_sim_") &&
          !String(agent.bolnaAgentId).startsWith("bolna_agent_");
        const verifiedSyncStatus = isRealBolnaId
          ? agent.syncStatus || "synced"
          : agent.syncStatus === "failed" ||
            agent.syncStatus === "needs_attention"
          ? agent.syncStatus
          : "pending";
        const computedMetrics = computeAgentMetrics(
          agent,
          allCalls,
          allLeads,
          allCampaigns
        );
        return {
          ...agent,
          syncStatus: verifiedSyncStatus,
          metrics: computedMetrics,
        };
      });

    return NextResponse.json({
      agents: scopedAgents,
      bolnaMode: bolnaService.isMockMode ? "unconfigured" : "live",
    });
  } catch (error: any) {
    return NextResponse.json({
      agents: getAgents(),
      error: error?.message,
    });
  }
}

export async function POST(req: NextRequest) {
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
      return NextResponse.json(
        {
          error: "Forbidden",
          details:
            "SALESPERSON accounts do not have administrative agent configuration privileges.",
        },
        { status: 403 }
      );
    }

    const isSuperAdmin = false;
    const body = await req.json();
    const targetOrgId =
      isSuperAdmin && body.organizationId
        ? String(body.organizationId)
        : session.organizationId || "org_default_01";

    if (!body.name || String(body.name).trim().length < 2) {
      return NextResponse.json(
        {
          error: "Validation Error",
          details: "Agent name is required (min 2 characters).",
        },
        { status: 400 }
      );
    }

    const isDraftOnly = body.status === "draft" && body.skipBolnaSync === true;

    const qualificationArray = Array.isArray(body.qualificationCriteria)
      ? body.qualificationCriteria
      : body.qualificationCriteria
      ? String(body.qualificationCriteria)
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean)
      : ["Verify budget, timeline, and decision authority"];

    const goalsArray = Array.isArray(body.conversationGoals)
      ? body.conversationGoals
      : body.conversationGoals
      ? String(body.conversationGoals)
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean)
      : ["Lead Qualification", "Requirement Discovery"];

    const extractionFields = Array.isArray(body.extractionFields)
      ? body.extractionFields
      : [
          {
            key: "customer_name",
            label: "Customer Name",
            type: "string",
            required: true,
          },
          { key: "budget", label: "Budget", type: "string", required: true },
          {
            key: "timeline",
            label: "Preferred Timeline",
            type: "string",
            required: true,
          },
          {
            key: "qualification_status",
            label: "Qualification Status",
            type: "enum",
            required: true,
          },
        ];

    const selectedKbIds: string[] = Array.isArray(body.knowledgeBaseIds)
      ? body.knowledgeBaseIds
      : [];

    // Resolve selected Knowledge Bases (only Ready & authorized sources)
    const db = await connectToDatabase();
    let selectedKbs = getKnowledgeBases().filter(
      (kb) =>
        selectedKbIds.includes(String(kb._id)) &&
        (isSuperAdmin || String(kb.organizationId) === String(targetOrgId))
    );
    if (db && selectedKbIds.length > 0) {
      const validObjIds = selectedKbIds.filter((id) =>
        mongoose.Types.ObjectId.isValid(id)
      );
      if (validObjIds.length > 0) {
        const dbKbs = await KnowledgeBase.find({
          _id: { $in: validObjIds },
        }).lean();
        if (dbKbs.length > 0) {
          selectedKbs = dbKbs.map((k: any) => ({
            ...k,
            _id: String(k._id),
          }));
        }
      }
    }

    const kbContextBlock = buildKnowledgeBaseContextForAgent(selectedKbs);

    const combinedSystemPrompt = [
      body.systemPrompt || "You are a polite, high-converting AI voice agent.",
      body.personality ? `\nAgent Personality:\n${body.personality}` : "",
      body.conversationInstructions
        ? `\nConversation Instructions:\n${body.conversationInstructions}`
        : "",
      body.conversationContext
        ? `\nConversation Context:\n${body.conversationContext}`
        : "",
      body.advancedInstructions
        ? `\nAdvanced Instructions:\n${body.advancedInstructions}`
        : "",
      body.languageInstructions
        ? `\nLanguage Instructions:\n${body.languageInstructions}`
        : "",
      qualificationArray.length > 0
        ? `\nQualification Criteria:\n- ${qualificationArray.join("\n- ")}`
        : "",
      kbContextBlock ? `\n${kbContextBlock}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let bolnaAgentId: string | undefined;
    let bolnaVersionId: string | undefined;
    let syncStatus: IAgent["syncStatus"] = "pending";
    let syncError: string | null = null;
    let lastSyncedAt: Date | undefined;

    if (!isDraftOnly) {
      if (bolnaService.isMockMode) {
        syncStatus = "pending";
        syncError =
          "Saved locally. Configure BOLNA_API_KEY in .env.local and click Retry Sync to synchronize with Bolna AI.";
      } else {
        try {
          const safeModel = String(
            body.llmModel || "gpt-4o-mini"
          ).includes("cluster")
            ? "gpt-4o-mini"
            : body.llmModel || "gpt-4o-mini";

          const bolnaResponse = await bolnaService.createAgent({
            agent_name: String(body.name).trim(),
            agent_type: body.agentType || "outbound",
            agent_welcome_message:
              body.greetingMessage ||
              `Hello! This is ${body.name}. How can I help you today?`,
            webhook_url: `${
              process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
            }/api/webhooks/bolna`,
            call_summary_enabled: body.callSummaryEnabled ?? true,
            llm_config: {
              model: safeModel,
              provider:
                body.llmProvider === "azure"
                  ? "openai"
                  : body.llmProvider || "openai",
              system_prompt: combinedSystemPrompt,
              max_tokens: Number(body.maxTokens || 250),
              temperature: Number(body.temperature ?? 0.2),
            },
            synthesizer_config: {
              provider: body.voiceProvider || "elevenlabs",
              voice_id: body.voiceId || "1Z7Y8o9cvUeWq8oLKgMY",
              voiceName: body.voiceName || "Tripti - Calm and Clear",
              model: body.voiceModel || "eleven_turbo_v2_5",
              speed: Number(body.speed || 1.0),
              language: resolveIsoLanguageCode(
                body.voiceLanguage || body.language
              ),
            },
            transcriber_config: {
              provider: body.transcriberProvider || "deepgram",
              language: resolveIsoLanguageCode(body.language),
              model: body.transcriberModel || "nova-2",
            },
            aiHangupEnabled: body.aiHangupEnabled !== false,
            call_transfer_config: {
              enabled: Boolean(
                body.callTransferEnabled &&
                  (body.warmTransferNumber || body.callTransferNumber)
              ),
              destination_number: String(
                body.warmTransferNumber || body.callTransferNumber || ""
              ).trim(),
              department: body.handoffDepartment || "Sales Desk",
            },
            telephony_config: {
              provider: body.telephonyProvider || "plivo",
              max_duration_seconds: Number(body.maxDurationSeconds || 300),
              hangup_after_silence: Number(
                body.hangupAfterSilenceSeconds || 12
              ),
            },
          });

          if (!bolnaResponse.simulated && bolnaResponse.agent_id) {
            bolnaAgentId = bolnaResponse.agent_id;
            bolnaVersionId = bolnaResponse.version_id;
            syncStatus = "synced";
            lastSyncedAt = new Date();
            syncError = null;
          } else {
            syncStatus = "pending";
          }
        } catch (bolnaErr: any) {
          console.error("Bolna createAgent error:", bolnaErr);
          syncStatus = "failed";
          syncError =
            bolnaErr?.message ||
            "Failed to synchronize new agent with Bolna AI.";
        }
      }
    }

    const objectIdHex = new mongoose.Types.ObjectId().toHexString();

    const newAgent: IAgent = {
      _id: objectIdHex,
      organizationId: targetOrgId,
      name: String(body.name).trim(),
      description: body.description || "",
      businessName: body.businessName || "",
      industry: body.industry || body.category || "Real Estate",
      category: body.industry || body.category || "Real Estate",
      businessObjective: body.businessObjective || "Lead Qualification",
      agentType: body.agentType || "outbound",
      voiceEngine: "Cascaded",
      bolnaAgentId,
      bolnaVersionId,
      configVersion: 1,
      versionHistory: [
        {
          version: 1,
          savedAt: new Date(),
          savedBy: session.email || "user_admin_01",
          syncStatus,
          bolnaVersionId,
          summary: isDraftOnly
            ? "Saved initial draft v1 (local only)"
            : "Initial agent configuration v1",
        },
      ],
      syncStatus,
      lastSyncedAt,
      syncError,
      language: body.language || "English + Hindi",
      defaultLanguage: body.defaultLanguage || body.language || "English + Hindi",
      additionalLanguages: Array.isArray(body.additionalLanguages)
        ? body.additionalLanguages
        : [],
      multilingualEnabled: body.multilingualEnabled ?? true,
      languageDetectionEnabled: body.languageDetectionEnabled ?? true,
      languageInstructions: body.languageInstructions || "",
      testingMode: body.testingMode || "outbound_test_call",
      voiceConfiguration: {
        provider: body.voiceProvider || "elevenlabs",
        voiceId: body.voiceId || "1Z7Y8o9cvUeWq8oLKgMY",
        voiceName: body.voiceName || "Tripti - Calm and Clear",
        model: body.voiceModel || "eleven_turbo_v2_5",
        language: body.voiceLanguage || body.language || "English + Hindi",
        speed: Number(body.speed || 1.0),
        stability: Number(body.stability ?? 0.75),
        pitch: Number(body.pitch || 1.0),
        bufferSize: Number(body.bufferSize || 250),
        audioFormat: "wav",
        transcriberProvider: body.transcriberProvider || "deepgram",
        transcriberModel: body.transcriberModel || "nova-2",
        samplingRate: Number(body.samplingRate || 16000),
        endpointingMs: Number(body.endpointingMs || 250),
      },
      conversationConfiguration: {
        systemPrompt: body.systemPrompt || "",
        greetingMessage: body.greetingMessage || "",
        personality: body.personality || "Professional & Friendly",
        conversationInstructions: body.conversationInstructions || "",
        businessInfo: body.businessInfo || "",
        conversationContext: body.conversationContext || "",
        advancedInstructions: body.advancedInstructions || "",
        conversationGoals: goalsArray,
        qualificationCriteria: qualificationArray,
        fallbackMessage:
          body.fallbackMessage ||
          "I apologize, I didn't catch that clearly. Could you please repeat that?",
        llmProvider: body.llmProvider || "openai",
        llmModel: body.llmModel || "gpt-4o-mini",
        maxTokens: Number(body.maxTokens || 250),
        temperature: Number(body.temperature ?? 0.2),
        knowledgeBaseIds: selectedKbIds,
      },
      toolsConfiguration: {
        knowledgeBaseEnabled: Boolean(selectedKbIds.length),
        enabledIntegrations: Array.isArray(body.enabledIntegrations)
          ? body.enabledIntegrations
          : [],
        crmProvider: body.crmProvider || "none",
        calendarProvider: body.calendarProvider || "none",
        customVariables: Array.isArray(body.customVariables)
          ? body.customVariables
          : ["{lead_name}", "{company_name}", "{city}"],
        webhookUrl: body.webhookUrl || "",
        webhookSecret: body.webhookSecret || "",
        appointmentToolEnabled: Boolean(body.appointmentToolEnabled),
        appointmentWebhookUrl: body.appointmentWebhookUrl || "",
        callTransferEnabled: Boolean(body.callTransferEnabled),
        callTransferNumber:
          body.warmTransferNumber || body.callTransferNumber || "",
        handoffDepartment: body.handoffDepartment || "Sales Desk",
        customApiTools: Array.isArray(body.customApiTools)
          ? body.customApiTools
          : [],
      },
      extractionsConfiguration: {
        enabled: true,
        fields: extractionFields,
      },
      qualificationConfiguration: {
        requiredFields: extractionFields.map((f: any) => f.key),
        thresholdScore: Number(body.thresholdScore || 70),
        defaultQualificationStatus:
          body.defaultQualificationStatus || "qualified",
        autoAssignSalesperson: body.autoAssignSalesperson ?? true,
        callSummaryEnabled: body.callSummaryEnabled ?? true,
        warmTransferNumber: body.warmTransferNumber || "",
      },
      callingConfiguration: {
        direction: body.agentType || "outbound",
        inboundEnabled:
          body.agentType === "inbound" || body.agentType === "both",
        outboundEnabled:
          body.agentType === "outbound" || body.agentType === "both",
        telephonyProvider: body.telephonyProvider || "plivo",
        callTimeoutSeconds: Number(body.callTimeoutSeconds || 30),
        maxDurationSeconds: Number(body.maxDurationSeconds || 300),
        maxRetries: Number(body.maxRetries ?? 2),
        retryIntervalMinutes: Number(body.retryIntervalMinutes ?? 60),
        hangupAfterSilenceSeconds: Number(
          body.hangupAfterSilenceSeconds || 12
        ),
        aiHangupEnabled: body.aiHangupEnabled !== false,
        interruptionWords: Number(body.interruptionWords || 2),
        endpointingMs: Number(body.endpointingMs || 250),
        endCallBehavior:
          body.endCallBehavior ||
          "Thank the caller politely and disconnect after summary",
        greetingBehavior: body.greetingBehavior || "agent_speaks_first",
        scheduleTimezone: body.scheduleTimezone || "Asia/Kolkata",
        allowedDays: Array.isArray(body.allowedDays)
          ? body.allowedDays
          : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        allowedCallingHours: {
          start: body.callingStartHour || "09:30",
          end: body.callingEndHour || "18:30",
        },
        phoneNumber: body.phoneNumber ? String(body.phoneNumber).trim() : "",
      },
      status: body.status || "active",
      createdBy: session.userId || "user_admin_01",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (db) {
      try {
        await Agent.create({
          ...newAgent,
          _id: new mongoose.Types.ObjectId(objectIdHex),
        });
      } catch (dbErr: any) {
        console.warn("MongoDB Agent.create warning:", dbErr.message);
      }
    }

    addAgent(newAgent);

    return NextResponse.json(
      {
        success: true,
        agent: newAgent,
        bolnaSynced: syncStatus === "synced",
        syncStatus,
        syncError: syncError || undefined,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Failed to create agent:", error);
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to create agent") },
      { status: 500 }
    );
  }
}
