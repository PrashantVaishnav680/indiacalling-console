import { requireOrganizationRole, assertTenantOwnership } from "@/lib/rbac";
import { formatErrorMessage } from "@/lib/error-formatter";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getSessionFromRequest, isAuthorizedRole } from "@/lib/auth";
import {
  getAgentById,
  updateAgent,
  deleteAgent,
  upsertAgentByBolnaId,
  getCalls,
  getLeads,
  getCampaigns,
  getKnowledgeBases,
} from "@/lib/store";
import { connectToDatabase } from "@/lib/db";
import Agent from "@/models/Agent";
import KnowledgeBase from "@/models/KnowledgeBase";
import Call from "@/models/Call";
import Lead from "@/models/Lead";
import Campaign from "@/models/Campaign";
import { bolnaService, resolveIsoLanguageCode } from "@/lib/bolna/client";
import { computeAgentMetrics } from "@/lib/analytics-counters";
import { buildKnowledgeBaseContextForAgent } from "@/lib/knowledge-processor";
import { IAgent } from "@/types";

async function findExistingAgent(id: string): Promise<IAgent | null> {
  const db = await connectToDatabase();
  if (db) {
    let doc: any = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      doc = await Agent.findById(id).lean();
    }
    if (!doc) {
      doc = await Agent.findOne({ bolnaAgentId: id }).lean();
    }
    if (doc) {
      const normalized: IAgent = {
        ...doc,
        _id: String(doc._id),
      };
      upsertAgentByBolnaId(normalized);
      return normalized;
    }
  }
  const storeAgent = getAgentById(id);
  return storeAgent || null;
}

export async function GET(
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
    const isSuper = false;
    const { searchParams } = new URL(req.url);
    const refreshFromBolna = searchParams.get("refresh") === "true";

    const agent = await findExistingAgent(id);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (
      !isSuper &&
      String(agent.organizationId) !== String(session.organizationId)
    ) {
      return NextResponse.json(
        {
          error: "Forbidden",
          details: "Cross-organization agent access is blocked.",
        },
        { status: 403 }
      );
    }

    if (
      refreshFromBolna &&
      agent.bolnaAgentId &&
      !agent.bolnaAgentId.startsWith("bolna_sim_") &&
      !bolnaService.isMockMode
    ) {
      try {
        const remote = await bolnaService.getAgent(agent.bolnaAgentId);
        if (remote) {
          agent.syncStatus = "synced";
          agent.lastSyncedAt = new Date();
          agent.syncError = null;
          updateAgent(agent._id, {
            syncStatus: "synced",
            lastSyncedAt: agent.lastSyncedAt,
            syncError: null,
          });
        }
      } catch (err: any) {
        agent.syncStatus = "needs_attention";
        agent.syncError = err?.message || "Failed to refresh from Bolna";
      }
    }

    let allCalls: any[] = getCalls();
    let allLeads: any[] = getLeads();
    let allCampaigns: any[] = getCampaigns();

    const dbInstance = await connectToDatabase();
    if (dbInstance) {
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

    const computedMetrics = computeAgentMetrics(
      agent,
      allCalls,
      allLeads,
      allCampaigns
    );
    agent.metrics = computedMetrics;

    return NextResponse.json({ agent });
  } catch (error: any) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to load agent") },
      { status: 500 }
    );
  }
}

async function handleUpdateAgent(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
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

    const isSuper = false;
    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams.id;
    const body = await req.json();

    const existing = await findExistingAgent(id);
    if (!existing) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (
      !isSuper &&
      String(existing.organizationId) !== String(session.organizationId)
    ) {
      return NextResponse.json(
        {
          error: "Forbidden",
          details: "Cannot modify an agent belonging to another organization.",
        },
        { status: 403 }
      );
    }

    const updatedName =
      body.name !== undefined ? String(body.name).trim() : existing.name;
    const updatedDescription =
      body.description !== undefined ? body.description : existing.description;
    const updatedBusinessName =
      body.businessName !== undefined
        ? body.businessName
        : existing.businessName || "";
    const updatedIndustry =
      body.industry ??
      body.category ??
      existing.industry ??
      existing.category ??
      "Real Estate";
    const updatedObjective =
      body.businessObjective !== undefined
        ? body.businessObjective
        : existing.businessObjective || "";
    const updatedAgentType =
      body.agentType !== undefined ? body.agentType : existing.agentType;
    const updatedLanguage =
      body.language !== undefined ? body.language : existing.language;
    const updatedStatus =
      body.status !== undefined ? body.status : existing.status;

    const updatedVoiceConfig = {
      ...existing.voiceConfiguration,
      provider:
        body.voiceProvider ??
        body.voiceConfiguration?.provider ??
        existing.voiceConfiguration?.provider ??
        "elevenlabs",
      voiceId:
        body.voiceId ??
        body.voiceConfiguration?.voiceId ??
        existing.voiceConfiguration?.voiceId ??
        "1Z7Y8o9cvUeWq8oLKgMY",
      voiceName:
        body.voiceName ??
        body.voiceConfiguration?.voiceName ??
        existing.voiceConfiguration?.voiceName ??
        "Tripti - Calm and Clear",
      model:
        body.voiceModel ??
        body.voiceConfiguration?.model ??
        existing.voiceConfiguration?.model ??
        "eleven_turbo_v2_5",
      language:
        body.voiceLanguage ??
        body.voiceConfiguration?.language ??
        existing.voiceConfiguration?.language ??
        updatedLanguage,
      speed: Number(
        body.speed ??
          body.voiceConfiguration?.speed ??
          existing.voiceConfiguration?.speed ??
          1.0
      ),
      stability: Number(
        body.stability ??
          body.voiceConfiguration?.stability ??
          existing.voiceConfiguration?.stability ??
          0.75
      ),
      pitch: Number(
        body.pitch ??
          body.voiceConfiguration?.pitch ??
          existing.voiceConfiguration?.pitch ??
          1.0
      ),
      bufferSize: Number(
        body.bufferSize ??
          body.voiceConfiguration?.bufferSize ??
          existing.voiceConfiguration?.bufferSize ??
          250
      ),
      transcriberProvider:
        body.transcriberProvider ??
        body.voiceConfiguration?.transcriberProvider ??
        existing.voiceConfiguration?.transcriberProvider ??
        "deepgram",
      transcriberModel:
        body.transcriberModel ??
        body.voiceConfiguration?.transcriberModel ??
        existing.voiceConfiguration?.transcriberModel ??
        "nova-2",
      endpointingMs: Number(
        body.endpointingMs ??
          body.voiceConfiguration?.endpointingMs ??
          existing.voiceConfiguration?.endpointingMs ??
          250
      ),
    };

    const rawQualCriteria =
      body.qualificationCriteria ??
      body.conversationConfiguration?.qualificationCriteria ??
      existing.conversationConfiguration?.qualificationCriteria ??
      [];
    const qualificationCriteriaArray = Array.isArray(rawQualCriteria)
      ? rawQualCriteria
      : String(rawQualCriteria)
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean);

    const rawGoals =
      body.conversationGoals ??
      body.conversationConfiguration?.conversationGoals ??
      existing.conversationConfiguration?.conversationGoals ??
      [];
    const conversationGoalsArray = Array.isArray(rawGoals)
      ? rawGoals
      : String(rawGoals)
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean);

    const selectedKbIds: string[] = Array.isArray(body.knowledgeBaseIds)
      ? body.knowledgeBaseIds
      : existing.conversationConfiguration?.knowledgeBaseIds || [];

    const updatedConversationConfig = {
      ...existing.conversationConfiguration,
      systemPrompt:
        body.systemPrompt ??
        body.conversationConfiguration?.systemPrompt ??
        existing.conversationConfiguration?.systemPrompt ??
        "",
      greetingMessage:
        body.greetingMessage ??
        body.conversationConfiguration?.greetingMessage ??
        existing.conversationConfiguration?.greetingMessage ??
        "",
      personality:
        body.personality ??
        body.conversationConfiguration?.personality ??
        existing.conversationConfiguration?.personality ??
        "Professional & Friendly",
      conversationInstructions:
        body.conversationInstructions ??
        body.conversationConfiguration?.conversationInstructions ??
        existing.conversationConfiguration?.conversationInstructions ??
        "",
      businessInfo:
        body.businessInfo ??
        body.conversationConfiguration?.businessInfo ??
        existing.conversationConfiguration?.businessInfo ??
        "",
      conversationContext:
        body.conversationContext ??
        body.conversationConfiguration?.conversationContext ??
        existing.conversationConfiguration?.conversationContext ??
        "",
      advancedInstructions:
        body.advancedInstructions ??
        body.conversationConfiguration?.advancedInstructions ??
        existing.conversationConfiguration?.advancedInstructions ??
        "",
      fallbackMessage:
        body.fallbackMessage ??
        body.conversationConfiguration?.fallbackMessage ??
        existing.conversationConfiguration?.fallbackMessage ??
        "I apologize, I didn't catch that clearly. Could you please repeat that?",
      llmProvider:
        body.llmProvider ??
        body.conversationConfiguration?.llmProvider ??
        existing.conversationConfiguration?.llmProvider ??
        "openai",
      llmModel:
        body.llmModel ??
        body.conversationConfiguration?.llmModel ??
        existing.conversationConfiguration?.llmModel ??
        "gpt-4o-mini",
      maxTokens: Number(
        body.maxTokens ??
          body.conversationConfiguration?.maxTokens ??
          existing.conversationConfiguration?.maxTokens ??
          250
      ),
      temperature: Number(
        body.temperature ??
          body.conversationConfiguration?.temperature ??
          existing.conversationConfiguration?.temperature ??
          0.2
      ),
      knowledgeBaseIds: selectedKbIds,
      conversationGoals: conversationGoalsArray,
      qualificationCriteria: qualificationCriteriaArray,
    };

    const updatedCallingConfig = {
      ...existing.callingConfiguration,
      direction:
        body.agentType ??
        body.callingConfiguration?.direction ??
        existing.callingConfiguration?.direction ??
        "outbound",
      telephonyProvider:
        body.telephonyProvider ??
        body.callingConfiguration?.telephonyProvider ??
        existing.callingConfiguration?.telephonyProvider ??
        "plivo",
      callTimeoutSeconds: Number(
        body.callTimeoutSeconds ??
          body.callingConfiguration?.callTimeoutSeconds ??
          existing.callingConfiguration?.callTimeoutSeconds ??
          30
      ),
      maxDurationSeconds: Number(
        body.maxDurationSeconds ??
          body.callingConfiguration?.maxDurationSeconds ??
          existing.callingConfiguration?.maxDurationSeconds ??
          300
      ),
      maxRetries: Number(
        body.maxRetries ??
          body.callingConfiguration?.maxRetries ??
          existing.callingConfiguration?.maxRetries ??
          2
      ),
      retryIntervalMinutes: Number(
        body.retryIntervalMinutes ??
          body.callingConfiguration?.retryIntervalMinutes ??
          existing.callingConfiguration?.retryIntervalMinutes ??
          60
      ),
      hangupAfterSilenceSeconds: Number(
        body.hangupAfterSilenceSeconds ??
          body.callingConfiguration?.hangupAfterSilenceSeconds ??
          existing.callingConfiguration?.hangupAfterSilenceSeconds ??
          12
      ),
      aiHangupEnabled:
        body.aiHangupEnabled !== undefined
          ? Boolean(body.aiHangupEnabled)
          : body.callingConfiguration?.aiHangupEnabled !== undefined
          ? Boolean(body.callingConfiguration.aiHangupEnabled)
          : existing.callingConfiguration?.aiHangupEnabled ?? true,
      interruptionWords: Number(
        body.interruptionWords ??
          body.callingConfiguration?.interruptionWords ??
          existing.callingConfiguration?.interruptionWords ??
          2
      ),
      endCallBehavior:
        body.endCallBehavior ??
        body.callingConfiguration?.endCallBehavior ??
        existing.callingConfiguration?.endCallBehavior ??
        "Thank the caller politely and disconnect after summary",
      greetingBehavior:
        body.greetingBehavior ??
        body.callingConfiguration?.greetingBehavior ??
        existing.callingConfiguration?.greetingBehavior ??
        "agent_speaks_first",
      scheduleTimezone:
        body.scheduleTimezone ??
        body.callingConfiguration?.scheduleTimezone ??
        existing.callingConfiguration?.scheduleTimezone ??
        "Asia/Kolkata",
      allowedDays: Array.isArray(body.allowedDays)
        ? body.allowedDays
        : existing.callingConfiguration?.allowedDays || [
            "Mon",
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
          ],
      allowedCallingHours: {
        start:
          body.callingStartHour ??
          existing.callingConfiguration?.allowedCallingHours?.start ??
          "09:30",
        end:
          body.callingEndHour ??
          existing.callingConfiguration?.allowedCallingHours?.end ??
          "18:30",
      },
      phoneNumber:
        body.phoneNumber !== undefined
          ? String(body.phoneNumber).trim()
          : body.callingConfiguration?.phoneNumber ??
            existing.callingConfiguration?.phoneNumber ??
            "",
    };

    const isStatusToggleOnly =
      Object.keys(body).length === 1 && body.status !== undefined;
    // Part 10: Save Draft must NOT unintentionally sync with Bolna
    const skipBolnaSync = Boolean(body.skipBolnaSync === true);

    let bolnaAgentId = existing.bolnaAgentId;
    let bolnaVersionId = existing.bolnaVersionId;
    let syncStatus: IAgent["syncStatus"] = existing.syncStatus || "pending";
    let lastSyncedAt = existing.lastSyncedAt;
    let syncError: string | null = null;

    const db = await connectToDatabase();

    if ((!isStatusToggleOnly && !skipBolnaSync) || body.forceSyncBolna === true) {
      if (bolnaService.isMockMode) {
        syncStatus = "pending";
        syncError =
          "Saved locally. Configure BOLNA_API_KEY in .env.local to synchronize with Bolna AI.";
      } else {
        // Resolve Knowledge Bases for prompt grounding
        let selectedKbs = getKnowledgeBases().filter((kb) =>
          selectedKbIds.includes(String(kb._id))
        );
        if (db && selectedKbIds.length > 0) {
          const validObjIds = selectedKbIds.filter((kid) =>
            mongoose.Types.ObjectId.isValid(kid)
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
          updatedConversationConfig.systemPrompt ||
            "You are a polite, high-converting AI voice agent.",
          updatedConversationConfig.personality
            ? `\nAgent Personality:\n${updatedConversationConfig.personality}`
            : "",
          updatedConversationConfig.conversationInstructions
            ? `\nConversation Instructions:\n${updatedConversationConfig.conversationInstructions}`
            : "",
          updatedConversationConfig.conversationContext
            ? `\nConversation Context:\n${updatedConversationConfig.conversationContext}`
            : "",
          updatedConversationConfig.advancedInstructions
            ? `\nAdvanced Instructions:\n${updatedConversationConfig.advancedInstructions}`
            : "",
          qualificationCriteriaArray.length > 0
            ? `\nQualification Criteria:\n- ${qualificationCriteriaArray.join("\n- ")}`
            : "",
          kbContextBlock ? `\n${kbContextBlock}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        const safeModel = String(
          updatedConversationConfig.llmModel || "gpt-4o-mini"
        ).includes("cluster")
          ? "gpt-4o-mini"
          : updatedConversationConfig.llmModel || "gpt-4o-mini";

        const bolnaConfigPayload = {
          agent_name: updatedName,
          agent_type: updatedAgentType || "outbound",
          agent_welcome_message:
            updatedConversationConfig.greetingMessage ||
            "Hello! How can I help you today?",
          webhook_url: `${
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
          }/api/webhooks/bolna`,
          llm_config: {
            model: safeModel,
            provider:
              updatedConversationConfig.llmProvider === "azure"
                ? "openai"
                : updatedConversationConfig.llmProvider || "openai",
            system_prompt: combinedSystemPrompt,
            max_tokens: updatedConversationConfig.maxTokens || 250,
            temperature: updatedConversationConfig.temperature ?? 0.2,
          },
          synthesizer_config: {
            provider: updatedVoiceConfig.provider,
            voice_id: updatedVoiceConfig.voiceId,
            voiceName: updatedVoiceConfig.voiceName,
            model: updatedVoiceConfig.model,
            speed: updatedVoiceConfig.speed,
            language: resolveIsoLanguageCode(
              updatedVoiceConfig.language || updatedLanguage
            ),
          },
          transcriber_config: {
            provider: updatedVoiceConfig.transcriberProvider || "deepgram",
            language: resolveIsoLanguageCode(updatedLanguage),
            model: updatedVoiceConfig.transcriberModel || "nova-2",
          },
          aiHangupEnabled: updatedCallingConfig.aiHangupEnabled,
          call_transfer_config: {
            enabled: Boolean(
              (body.callTransferEnabled ?? existing.toolsConfiguration?.callTransferEnabled) &&
                (body.warmTransferNumber ||
                  body.callTransferNumber ||
                  existing.toolsConfiguration?.callTransferNumber ||
                  existing.qualificationConfiguration?.warmTransferNumber)
            ),
            destination_number: String(
              body.warmTransferNumber ||
                body.callTransferNumber ||
                existing.toolsConfiguration?.callTransferNumber ||
                existing.qualificationConfiguration?.warmTransferNumber ||
                ""
            ).trim(),
            department:
              body.handoffDepartment ||
              existing.toolsConfiguration?.handoffDepartment ||
              "Sales Desk",
          },
          telephony_config: {
            provider: updatedCallingConfig.telephonyProvider || "plivo",
            max_duration_seconds: updatedCallingConfig.maxDurationSeconds,
            hangup_after_silence:
              updatedCallingConfig.hangupAfterSilenceSeconds,
          },
        };

        try {
          if (
            bolnaAgentId &&
            !bolnaAgentId.startsWith("bolna_sim_") &&
            !bolnaAgentId.startsWith("bolna_agent_")
          ) {
            const updateRes = await bolnaService.updateAgent(
              bolnaAgentId,
              bolnaConfigPayload
            );
            bolnaAgentId = updateRes.agent_id || bolnaAgentId;
            bolnaVersionId = updateRes.version_id || bolnaVersionId;
            syncStatus = updateRes.simulated ? "pending" : "synced";
            lastSyncedAt = new Date();
            syncError = null;
          } else {
            const createRes = await bolnaService.createAgent(
              bolnaConfigPayload
            );
            bolnaAgentId = createRes.agent_id;
            bolnaVersionId = createRes.version_id;
            syncStatus = createRes.simulated ? "pending" : "synced";
            lastSyncedAt = new Date();
            syncError = null;
          }
        } catch (bolnaErr: any) {
          console.error("Bolna updateAgent error:", bolnaErr);
          syncStatus = "failed";
          syncError =
            bolnaErr?.message ||
            "Saved locally in IndiaCalling Console, but Bolna AI synchronization failed.";
        }
      }
    }

    const nextVersionNumber =
      (existing.configVersion || 1) + (isStatusToggleOnly ? 0 : 1);
    const nextVersionHistory = [...(existing.versionHistory || [])];
    if (!isStatusToggleOnly) {
      nextVersionHistory.unshift({
        version: nextVersionNumber,
        savedAt: new Date(),
        savedBy: session.email || "user_admin_01",
        syncStatus,
        bolnaVersionId,
        summary: skipBolnaSync
          ? `Saved draft v${nextVersionNumber} (local only)`
          : body.versionSummary || `Updated configuration v${nextVersionNumber}`,
      });
    }

    const updatedFields: Partial<IAgent> = {
      name: updatedName,
      description: updatedDescription,
      businessName: updatedBusinessName,
      industry: updatedIndustry,
      category: updatedIndustry,
      businessObjective: updatedObjective,
      agentType: updatedAgentType,
      language: updatedLanguage,
      defaultLanguage:
        body.defaultLanguage ?? existing.defaultLanguage ?? updatedLanguage,
      additionalLanguages: Array.isArray(body.additionalLanguages)
        ? body.additionalLanguages
        : existing.additionalLanguages || [],
      multilingualEnabled:
        body.multilingualEnabled ?? existing.multilingualEnabled ?? true,
      languageDetectionEnabled:
        body.languageDetectionEnabled ??
        existing.languageDetectionEnabled ??
        true,
      languageInstructions:
        body.languageInstructions ?? existing.languageInstructions ?? "",
      status: updatedStatus,
      bolnaAgentId,
      bolnaVersionId,
      configVersion: nextVersionNumber,
      versionHistory: nextVersionHistory.slice(0, 20),
      syncStatus,
      lastSyncedAt,
      syncError,
      voiceConfiguration: updatedVoiceConfig,
      conversationConfiguration: updatedConversationConfig,
      toolsConfiguration: body.toolsConfiguration || {
        ...existing.toolsConfiguration,
        knowledgeBaseEnabled: Boolean(selectedKbIds.length),
        enabledIntegrations:
          body.enabledIntegrations ??
          existing.toolsConfiguration?.enabledIntegrations ??
          [],
        crmProvider:
          body.crmProvider ?? existing.toolsConfiguration?.crmProvider ?? "none",
        calendarProvider:
          body.calendarProvider ??
          existing.toolsConfiguration?.calendarProvider ??
          "none",
        customVariables: body.customVariables ||
          existing.toolsConfiguration?.customVariables || [
            "{lead_name}",
            "{company_name}",
          ],
        webhookUrl:
          body.webhookUrl ?? existing.toolsConfiguration?.webhookUrl ?? "",
        webhookSecret:
          body.webhookSecret ?? existing.toolsConfiguration?.webhookSecret ?? "",
        appointmentToolEnabled:
          body.appointmentToolEnabled ??
          existing.toolsConfiguration?.appointmentToolEnabled ??
          false,
        appointmentWebhookUrl:
          body.appointmentWebhookUrl ??
          existing.toolsConfiguration?.appointmentWebhookUrl ??
          "",
        callTransferEnabled:
          body.callTransferEnabled ??
          existing.toolsConfiguration?.callTransferEnabled ??
          false,
        callTransferNumber:
          body.warmTransferNumber ??
          body.callTransferNumber ??
          existing.toolsConfiguration?.callTransferNumber ??
          "",
        handoffDepartment:
          body.handoffDepartment ??
          existing.toolsConfiguration?.handoffDepartment ??
          "Sales Desk",
        customApiTools:
          body.customApiTools ??
          existing.toolsConfiguration?.customApiTools ??
          [],
      },
      extractionsConfiguration: body.extractionsConfiguration || {
        enabled: true,
        fields:
          body.extractionFields ||
          existing.extractionsConfiguration?.fields ||
          [],
      },
      qualificationConfiguration: {
        ...existing.qualificationConfiguration,
        thresholdScore: Number(
          body.thresholdScore ??
            existing.qualificationConfiguration?.thresholdScore ??
            70
        ),
        defaultQualificationStatus:
          body.defaultQualificationStatus ??
          existing.qualificationConfiguration?.defaultQualificationStatus ??
          "qualified",
        autoAssignSalesperson:
          body.autoAssignSalesperson ??
          existing.qualificationConfiguration?.autoAssignSalesperson ??
          true,
      },
      callingConfiguration: updatedCallingConfig,
      updatedAt: new Date(),
    };

    if (db) {
      if (mongoose.Types.ObjectId.isValid(existing._id)) {
        await Agent.findByIdAndUpdate(
          existing._id,
          { $set: updatedFields },
          { new: true }
        );
      } else if (existing.bolnaAgentId) {
        await Agent.findOneAndUpdate(
          { bolnaAgentId: existing.bolnaAgentId },
          { $set: updatedFields },
          { new: true }
        );
      }
    }

    const updatedInStore =
      updateAgent(existing._id, updatedFields) || {
        ...existing,
        ...updatedFields,
      };

    return NextResponse.json({
      success: syncStatus !== "failed" && syncStatus !== "needs_attention",
      savedLocally: true,
      bolnaSynced: syncStatus === "synced",
      syncStatus,
      syncError: syncError || undefined,
      agent: updatedInStore,
      updated: updatedInStore,
    });
  } catch (error: any) {
    console.error("Agent update error:", error);
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to update agent") },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  return handleUpdateAgent(req, context);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  return handleUpdateAgent(req, context);
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const __rbac = requireOrganizationRole(req);
  if (!__rbac.ok) return __rbac.response;

  try {
    const session = getSessionFromRequest(req);
    if (
      !session ||
      !isAuthorizedRole(session.role, ["organization"])
    ) {
      return NextResponse.json(
        {
          error: "Forbidden",
          details: "Only SUPER_ADMIN or CLIENT_ADMIN can delete AI agents.",
        },
        { status: 403 }
      );
    }

    const isSuper = false;
    const resolvedParams = await Promise.resolve(context.params);
    const id = resolvedParams.id;
    const { searchParams } = new URL(req.url);
    const localOnly = searchParams.get("localOnly") === "true";

    const existing = await findExistingAgent(id);
    if (!existing) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (
      !isSuper &&
      String(existing.organizationId) !== String(session.organizationId)
    ) {
      return NextResponse.json(
        {
          error: "Forbidden",
          details: "Cannot delete an agent belonging to another organization.",
        },
        { status: 403 }
      );
    }

    let bolnaDeleted = false;
    if (existing.bolnaAgentId && !localOnly) {
      try {
        bolnaDeleted = await bolnaService.deleteAgent(existing.bolnaAgentId);
      } catch (err: any) {
        console.warn("Bolna deleteAgent warning:", err?.message);
      }
    }

    const db = await connectToDatabase();
    if (db) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        await Agent.findByIdAndDelete(id);
      } else {
        await Agent.findOneAndDelete({ bolnaAgentId: id });
      }
    }

    deleteAgent(id);
    if (existing._id) {
      deleteAgent(existing._id);
    }

    return NextResponse.json({
      success: true,
      bolnaDeleted,
      message: "Agent deleted from IndiaCalling Console",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: formatErrorMessage(error, 500, "Failed to delete agent") },
      { status: 500 }
    );
  }
}
