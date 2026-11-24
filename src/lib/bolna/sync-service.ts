import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import Agent from "@/models/Agent";
import Call from "@/models/Call";
import Lead from "@/models/Lead";
import Transcript from "@/models/Transcript";
import UsageLedger from "@/models/UsageLedger";
import {
  getAgents,
  upsertAgentByBolnaId,
  upsertCallByExecutionId,
  addTranscript,
  setSyncState,
  getLeads,
  addLead,
  addAssignment,
} from "@/lib/store";
import {
  bolnaService,
  resolveIsoLanguageCode,
  normalizeBolnaStatus,
  normalizeIndianPhoneE164,
  extractBolnaQualification,
  evaluateLeadQualification,
} from "@/lib/bolna/client";
import { IAgent, ICall, ILead, ITranscript } from "@/types";

export function extractAgentFieldsFromBolnaRemote(
  remote: Record<string, any>,
  organizationId: string
): IAgent {
  const bolnaAgentId = String(remote.id || remote.agent_id || "");
  const agentConfig = remote.agent_config || remote;
  const tasks = Array.isArray(agentConfig.tasks) ? agentConfig.tasks : [];
  const firstTask = tasks[0] || {};
  const toolsConfig = firstTask.tools_config || {};
  const synth = toolsConfig.synthesizer || agentConfig.synthesizer || {};
  const synthConfig = synth.provider_config || {};
  const transcriber = toolsConfig.transcriber || agentConfig.transcriber || {};
  const promptObj =
    remote.agent_prompts?.task_1 ||
    agentConfig.agent_prompts?.task_1 ||
    {};

  const rawLang = String(
    transcriber.language || synthConfig.language || "en"
  ).toLowerCase();
  const languageLabel =
    rawLang === "hi"
      ? "Hindi"
      : rawLang === "ta"
      ? "Tamil"
      : rawLang === "te"
      ? "Telugu"
      : rawLang === "gu"
      ? "Gujarati"
      : rawLang === "mr"
      ? "Marathi"
      : rawLang === "bn"
      ? "Bengali"
      : "English + Hindi";

  const systemPrompt =
    promptObj.system_prompt ||
    remote.system_prompt ||
    "You are a professional AI voice assistant for IndiaCalling Console.";
  const greetingMessage =
    agentConfig.agent_welcome_message ||
    remote.agent_welcome_message ||
    "Hello! Thank you for connecting with us. How may I assist you today?";

  return {
    _id: new mongoose.Types.ObjectId().toHexString(),
    organizationId,
    name:
      agentConfig.agent_name ||
      remote.agent_name ||
      remote.name ||
      `Bolna Agent (${bolnaAgentId.slice(0, 8)})`,
    description:
      remote.description ||
      `Synchronized from Bolna AI (${bolnaAgentId.slice(0, 8)})`,
    businessName: "",
    industry: agentConfig.agent_type || "General Business",
    category: agentConfig.agent_type || "General Business",
    businessObjective: "Lead Qualification & Customer Assistance",
    agentType:
      agentConfig.agent_type === "inbound"
        ? "inbound"
        : agentConfig.agent_type === "both"
        ? "both"
        : "outbound",
    voiceEngine: "Cascaded",
    bolnaAgentId,
    bolnaVersionId: remote.version_id || agentConfig.version_id,
    configVersion: 1,
    versionHistory: [
      {
        version: 1,
        savedAt: new Date(),
        savedBy: "bolna_sync",
        syncStatus: "synced",
        bolnaVersionId: remote.version_id || agentConfig.version_id,
        summary: "Imported from Bolna AI",
      },
    ],
    syncStatus: "synced",
    lastSyncedAt: new Date(),
    syncError: null,
    language: languageLabel,
    testingMode: "outbound_test_call",
    voiceConfiguration: {
      provider: synth.provider || "elevenlabs",
      voiceId: synthConfig.voice_id || synth.voice_id || "1Z7Y8o9cvUeWq8oLKgMY",
      voiceName: synthConfig.voice || synth.voice || "Tripti - Calm and Clear",
      speed: Number(synth.speed || 1.0),
      pitch: 1.0,
      bufferSize: Number(synth.buffer_size || 250),
      audioFormat: synth.audio_format || "wav",
      transcriberProvider: transcriber.provider || "deepgram",
      transcriberModel: transcriber.model || "nova-2",
      samplingRate: Number(transcriber.sampling_rate || 16000),
      endpointingMs: Number(transcriber.endpointing || 250),
    },
    conversationConfiguration: {
      systemPrompt,
      greetingMessage,
      businessInfo: "",
      conversationGoals: ["Lead Qualification", "Customer Discovery"],
      qualificationCriteria: ["Verify customer interest, budget, and timeline"],
      llmProvider:
        toolsConfig.llm_agent?.llm_config?.provider || "openai",
      llmModel:
        toolsConfig.llm_agent?.llm_config?.model || "gpt-4o-mini",
      maxTokens: Number(toolsConfig.llm_agent?.llm_config?.max_tokens || 250),
      temperature: Number(
        toolsConfig.llm_agent?.llm_config?.temperature ?? 0.2
      ),
    },
    qualificationConfiguration: {
      requiredFields: ["budget", "timeline", "interest_level"],
      thresholdScore: 70,
      autoAssignSalesperson: true,
      callSummaryEnabled: true,
    },
    callingConfiguration: {
      direction: "outbound",
      maxDurationSeconds: Number(firstTask.task_config?.call_terminate || 300),
      hangupAfterSilenceSeconds: Number(
        firstTask.task_config?.hangup_after_silence || 12
      ),
      interruptionWords: Number(
        firstTask.task_config?.number_of_words_for_interruption || 2
      ),
      scheduleTimezone: "Asia/Kolkata",
      phoneNumber: "",
    },
    configuration: remote,
    status: "active",
    createdBy: "bolna_sync",
    createdAt: remote.created_at ? new Date(remote.created_at) : new Date(),
    updatedAt: remote.updated_at ? new Date(remote.updated_at) : new Date(),
  };
}

export async function syncBolnaAgentsAndCalls(options?: {
  organizationId?: string;
  targetAgentId?: string;
  syncAgents?: boolean;
  syncCalls?: boolean;
}) {
  const orgId = options?.organizationId || "org_default_01";
  const shouldSyncAgents = options?.syncAgents ?? true;
  const shouldSyncCalls = options?.syncCalls ?? true;

  let importedAgents = 0;
  let updatedAgents = 0;
  let pushedAgents = 0;
  let syncedCalls = 0;
  let updatedCalls = 0;
  const errors: string[] = [];

  const db = await connectToDatabase();

  // Load any existing MongoDB agents, calls and leads into memory store first so we have a unified view
  if (db) {
    const [dbAgents, dbCalls, dbLeads] = await Promise.all([
      Agent.find({ organizationId: orgId }).lean(),
      Call.find({ organizationId: orgId }).lean(),
      Lead.find({ organizationId: orgId }).lean(),
    ]);
    for (const doc of dbAgents) {
      upsertAgentByBolnaId({
        ...(doc as unknown as IAgent),
        _id: String(doc._id),
      });
    }
    for (const doc of dbCalls) {
      upsertCallByExecutionId({
        ...(doc as unknown as ICall),
        _id: String(doc._id),
      });
    }
    for (const doc of dbLeads) {
      addLead({
        ...(doc as unknown as ILead),
        _id: String(doc._id),
      });
    }
  }

  if (bolnaService.isMockMode) {
    const summary = setSyncState({
      lastSyncedAt: new Date().toISOString(),
      importedAgents: 0,
      updatedAgents: 0,
      pushedAgents: 0,
      syncedCalls: 0,
      updatedCalls: 0,
      errors: [],
    });
    return {
      success: true,
      mode: "simulated",
      message:
        "Bolna is currently in Simulated Demo mode because no live BOLNA_API_KEY is configured in .env.local.",
      summary,
      agents: getAgents(),
    };
  }

  // PHASE 1: Organization-Scoped Agent Sync (Strict Tenant Isolation)
  // NEVER imports foreign agents from a shared Bolna API key into this organization.
  // Only refreshes status for agents owned by THIS organization and pushes unlinked local org agents.
  if (shouldSyncAgents) {
    try {
      const orgLocalAgents = getAgents().filter(
        (a) => String(a.organizationId) === String(orgId)
      );

      for (const localAgent of orgLocalAgents) {
        const needsPush =
          !localAgent.bolnaAgentId ||
          localAgent.bolnaAgentId.startsWith("bolna_sim_") ||
          localAgent.bolnaAgentId.startsWith("bolna_agent_") ||
          localAgent.syncStatus === "pending" ||
          localAgent.syncStatus === "failed";

        if (needsPush) {
          try {
            const createdRemote = await bolnaService.createAgent({
              agent_name: localAgent.name,
              agent_type: localAgent.agentType || "outbound",
              agent_welcome_message:
                localAgent.conversationConfiguration?.greetingMessage ||
                "Hello! How may I assist you today?",
              webhook_url: `${
                process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
              }/api/webhooks/bolna`,
              llm_config: {
                model: localAgent.conversationConfiguration?.llmModel || "gpt-4o-mini",
                provider: localAgent.conversationConfiguration?.llmProvider || "openai",
                system_prompt:
                  localAgent.conversationConfiguration?.systemPrompt ||
                  "You are a helpful AI voice agent.",
              },
              synthesizer_config: {
                provider: localAgent.voiceConfiguration?.provider || "elevenlabs",
                voice_id:
                  localAgent.voiceConfiguration?.voiceId || "1Z7Y8o9cvUeWq8oLKgMY",
                voiceName:
                  localAgent.voiceConfiguration?.voiceName || "Tripti - Calm and Clear",
                speed: localAgent.voiceConfiguration?.speed || 1.0,
                language: resolveIsoLanguageCode(localAgent.language),
              },
              transcriber_config: {
                provider: localAgent.voiceConfiguration?.transcriberProvider || "deepgram",
                language: resolveIsoLanguageCode(localAgent.language),
                model: localAgent.voiceConfiguration?.transcriberModel || "nova-2",
              },
              telephony_config: {
                provider: localAgent.callingConfiguration?.telephonyProvider || "plivo",
                max_duration_seconds:
                  localAgent.callingConfiguration?.maxDurationSeconds || 300,
              },
            });

            localAgent.bolnaAgentId = createdRemote.agent_id;
            localAgent.bolnaVersionId = createdRemote.version_id;
            localAgent.syncStatus = "synced";
            localAgent.lastSyncedAt = new Date();
            localAgent.syncError = "";

            if (db && mongoose.Types.ObjectId.isValid(localAgent._id)) {
              await Agent.findByIdAndUpdate(localAgent._id, {
                $set: {
                  bolnaAgentId: createdRemote.agent_id,
                  bolnaVersionId: createdRemote.version_id,
                  syncStatus: "synced",
                  lastSyncedAt: new Date(),
                  syncError: "",
                },
              });
            }
            pushedAgents += 1;
          } catch (pushErr: any) {
            localAgent.syncStatus = "failed";
            localAgent.syncError = pushErr?.message || "Bolna push failed";
            errors.push(`Agent "${localAgent.name}": ${localAgent.syncError}`);
          }
        } else if (localAgent.bolnaAgentId) {
          // Verify/refresh this organization-owned agent directly on Bolna
          try {
            const remoteDetail = await bolnaService.getAgent(localAgent.bolnaAgentId);
            if (remoteDetail) {
              localAgent.syncStatus = "synced";
              localAgent.lastSyncedAt = new Date();
              localAgent.syncError = "";
              if (db && mongoose.Types.ObjectId.isValid(localAgent._id)) {
                await Agent.findByIdAndUpdate(localAgent._id, {
                  $set: {
                    syncStatus: "synced",
                    lastSyncedAt: new Date(),
                    syncError: "",
                  },
                });
              }
              updatedAgents += 1;
            }
          } catch {
            // Non-fatal if remote fetch temporarily unavailable
          }
        }
      }
    } catch (agentSyncErr: any) {
      errors.push(`Agent sync error: ${agentSyncErr?.message || "Unknown error"}`);
    }
  }

  // PHASE 2: Call Execution History Sync (`GET /v2/agent/{agent_id}/executions`)
  if (shouldSyncCalls) {
    const allAgents = getAgents().filter((a) =>
      String(a.organizationId) === String(orgId) &&
      (options?.targetAgentId
        ? String(a._id) === options.targetAgentId ||
          a.bolnaAgentId === options.targetAgentId
        : Boolean(
            a.bolnaAgentId &&
              !a.bolnaAgentId.startsWith("bolna_sim_") &&
              !a.bolnaAgentId.startsWith("bolna_agent_")
          ))
    );

    for (const agent of allAgents) {
      if (!agent.bolnaAgentId) continue;
      try {
        const rawExecutions = await bolnaService.getAgentExecutions(agent.bolnaAgentId, {
          pageSize: 50,
        });
        // Process oldest -> newest so the latest call outcome wins cleanly
        const executions = [...rawExecutions].sort((a, b) => {
          const ta = new Date(a.created_at || 0).getTime();
          const tb = new Date(b.created_at || 0).getTime();
          return ta - tb;
        });

        for (const rawExec of executions) {
          const execId = String(
            rawExec.id || rawExec.execution_id || rawExec.call_id || ""
          );
          if (!execId) continue;

          const normalized = bolnaService.normalizeExecutionPayload({
            ...rawExec,
            agent_id: rawExec.agent_id || agent.bolnaAgentId,
          });

          const extracted =
            normalized.extracted_data || rawExec.extracted_data || {};
          const qualInfo = evaluateLeadQualification({
            callStatus: normalized.status,
            durationSeconds: normalized.duration_seconds,
            extractedData: extracted,
            summary: normalized.summary || rawExec.summary,
          });
          const isQualified = qualInfo.isQualified;

          const rawPhone =
            normalized.recipient_phone_number ||
            rawExec.user_number ||
            rawExec.telephony_data?.to_number ||
            "Unknown";
          const phoneE164 =
            rawPhone !== "Unknown" && rawPhone !== "Browser Web-Call"
              ? normalizeIndianPhoneE164(rawPhone)
              : rawPhone;

          // Check if lead already exists in DB or store by phone
          let leadDoc: any = null;
          if (
            phoneE164 &&
            phoneE164 !== "Unknown" &&
            phoneE164 !== "Browser Web-Call"
          ) {
            if (db) {
              leadDoc = await Lead.findOne({
                organizationId: orgId,
                phone: phoneE164,
              });
            }
            if (!leadDoc) {
              leadDoc = getLeads().find(
                (l) =>
                  String(l.organizationId) === String(orgId) &&
                  l.phone === phoneE164
              );
            }
          }

          let leadObjectId = leadDoc
            ? String(leadDoc._id)
            : new mongoose.Types.ObjectId().toHexString();
          let leadName = leadDoc ? leadDoc.name : qualInfo.customerName;

          if (!leadName) {
            leadName =
              normalized.direction === "web_call"
                ? "Browser Voice Tester"
                : phoneE164 && phoneE164 !== "Unknown"
                ? `Prospect (${phoneE164.slice(-4)})`
                : "Bolna Voice Contact";
          }

          let existingCallDoc: any = null;
          if (db) {
            existingCallDoc = await Call.findOne({
              $or: [{ bolnaExecutionId: execId }, { bolnaCallId: execId }],
            });
          }

          const callObjectId = existingCallDoc
            ? String(existingCallDoc._id)
            : new mongoose.Types.ObjectId().toHexString();

          // Upsert Lead document whenever we have a phone number
          if (
            phoneE164 &&
            phoneE164 !== "Unknown" &&
            phoneE164 !== "Browser Web-Call"
          ) {
            const isExplicitDisqualify =
              qualInfo.leadStatus === "COLD" ||
              qualInfo.leadStatus === "LOST" ||
              qualInfo.leadStatus === "UNQUALIFIED";
            const preserveExistingQualified =
              leadDoc?.qualificationStatus === "qualified" &&
              (leadDoc?.interestLevel === "high" || leadDoc?.interestLevel === "medium") &&
              !isExplicitDisqualify;

            let leadQualStatus: ILead["qualificationStatus"];
            let bestInterest: ILead["interestLevel"];
            let bestScore: number;

            if (isQualified) {
              leadQualStatus = "qualified";
              bestInterest = qualInfo.interestLevel;
              bestScore = Math.max(qualInfo.score, leadDoc?.qualificationScore || 0);
            } else if (preserveExistingQualified) {
              // Keep existing verified qualification + interest paired (never downgrade status while keeping High interest)
              leadQualStatus = "qualified";
              bestInterest = leadDoc.interestLevel;
              bestScore = leadDoc.qualificationScore || qualInfo.score;
            } else if (normalized.status === "completed") {
              leadQualStatus = "follow_up_required";
              bestInterest = qualInfo.interestLevel; // strictly "low" when !isQualified
              bestScore = Math.min(qualInfo.score, 45);
            } else {
              leadQualStatus = leadDoc?.qualificationStatus || "new";
              bestInterest = leadDoc?.interestLevel || "unknown";
              bestScore = leadDoc?.qualificationScore || 0;
            }

            const bestBudget = qualInfo.budget || leadDoc?.budget;
            const bestLocation = qualInfo.location || leadDoc?.location || "India";

            const isInvalidName =
              !qualInfo.customerName ||
              qualInfo.customerName.length < 3 ||
              qualInfo.customerName.toLowerCase().includes("null") ||
              qualInfo.customerName.toLowerCase().includes("unknown") ||
              qualInfo.customerName.includes("एस्टेड") ||
              qualInfo.customerName.toLowerCase().includes("interested");

            const finalLeadName = !isInvalidName
              ? qualInfo.customerName!
              : leadDoc?.name &&
                !leadDoc.name.includes("एस्टेड") &&
                !leadDoc.name.toLowerCase().includes("null") &&
                leadDoc.name.length >= 3
              ? leadDoc.name
              : `Prospect (${phoneE164.slice(-4)})`;

            leadName = finalLeadName;

            const leadRecord: ILead = {
              _id: leadObjectId,
              organizationId: orgId,
              name: finalLeadName,
              phone: phoneE164,
              company: bestLocation || "Residential Prospect",
              location: bestLocation,
              city: bestLocation.includes("Indore") ? "Indore" : "Indore",
              budget: bestBudget,
              source: `Bolna AI Voice Call (${agent.name})`,
              assignedAgentId: agent._id,
              qualificationStatus: leadQualStatus,
              interestLevel: bestInterest,
              qualificationScore: bestScore,
              qualificationReason: isQualified ? qualInfo.reason : leadDoc?.qualificationReason || qualInfo.reason,
              lastCallId: callObjectId,
              lastCallDate: normalized.created_at
                ? new Date(normalized.created_at)
                : new Date(),
              doNotContact: false,
              notes: qualInfo.nextAction
                ? [`Next action: ${qualInfo.nextAction}`]
                : leadDoc?.notes || [],
              createdAt:
                leadDoc?.createdAt ||
                (normalized.created_at
                  ? new Date(normalized.created_at)
                  : new Date()),
              updatedAt: new Date(),
            };

            addLead(leadRecord);

            if (db) {
              await Lead.findOneAndUpdate(
                { organizationId: orgId, phone: phoneE164 },
                {
                  $set: {
                    ...leadRecord,
                    _id: new mongoose.Types.ObjectId(leadObjectId),
                  },
                },
                { upsert: true, new: true }
              );
            }

            if (isQualified || leadDoc?.qualificationStatus === "qualified") {
              addAssignment({
                _id: `assign_${leadObjectId}`,
                organizationId: orgId,
                leadId: leadObjectId,
                leadName: finalLeadName,
                salespersonId: "sales_rep_01",
                salespersonName: "Pending Assignment",
                assignedBy: "bolna_ai_auto_qualifier",
                assignmentMethod: "round_robin",
                status: "pending",
                assignedAt: new Date(),
                notes: `Auto-qualified via Bolna sync: ${qualInfo.reason}`,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
            }
          }

          const callOutcome =
            normalized.status === "completed"
              ? isQualified
                ? "Qualified Lead"
                : "Conversation Completed"
              : normalized.status === "no_answer"
              ? "No Answer"
              : normalized.status === "busy"
              ? "User Busy"
              : normalized.status === "failed"
              ? "Call Failed"
              : "In Progress";

          const callRecord: ICall = {
            _id: callObjectId,
            organizationId: orgId,
            agentId: agent._id,
            agentName: agent.name,
            leadId:
              phoneE164 &&
              phoneE164 !== "Unknown" &&
              phoneE164 !== "Browser Web-Call"
                ? leadObjectId
                : undefined,
            leadName,
            direction: normalized.direction || "outbound",
            status: normalizeBolnaStatus(normalized.status),
            bolnaCallId: execId,
            bolnaExecutionId: execId,
            phoneNumber: phoneE164,
            durationSeconds: normalized.duration_seconds || 0,
            cost: normalized.total_cost || 0,
            startedAt: normalized.created_at
              ? new Date(normalized.created_at)
              : new Date(),
            endedAt: normalized.ended_at
              ? new Date(normalized.ended_at)
              : undefined,
            recordingUrl: normalized.recording_url,
            transcript: normalized.transcript_text,
            callOutcome,
            qualificationStatus: isQualified
              ? "qualified"
              : normalized.status === "completed"
              ? "follow_up"
              : "pending",
            isSimulated: false,
            testingMode:
              normalized.direction === "web_call"
                ? "browser_web_call"
                : "outbound_test_call",
            syncStatus: "synced",
            extractedData: extracted,
            qualificationResult: {
              status: isQualified ? "qualified" : "follow_up",
              score: qualInfo.score,
              interestLevel: qualInfo.interestLevel,
              reason: qualInfo.reason,
              budget: qualInfo.budget,
              timeline: qualInfo.timeline,
            },
            createdAt: normalized.created_at
              ? new Date(normalized.created_at)
              : new Date(),
            updatedAt: new Date(),
          };

          const { created: createdInMemory } = upsertCallByExecutionId(callRecord);
          if (createdInMemory) syncedCalls += 1;
          else updatedCalls += 1;

          // Upsert in MongoDB Call collection
          if (db) {
            await Call.findOneAndUpdate(
              { bolnaExecutionId: execId },
              {
                $set: {
                  ...callRecord,
                  _id: new mongoose.Types.ObjectId(callObjectId),
                },
              },
              { upsert: true, new: true }
            );
          }

          // Upsert Transcript if available
          if (normalized.transcript && normalized.transcript.length > 0) {
            const transcriptObj: ITranscript = {
              _id: `trans_${callObjectId}`,
              organizationId: orgId,
              callId: callObjectId,
              agentId: agent._id,
              summary:
                normalized.summary ||
                `Transcript synced from Bolna execution ${execId}.`,
              rawText: normalized.transcript_text,
              messages: normalized.transcript.map((m) => ({
                speaker: m.speaker,
                text: m.text,
                timestamp: String(m.timestamp || "00:00"),
              })),
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            addTranscript(transcriptObj);

            if (db && mongoose.Types.ObjectId.isValid(callObjectId)) {
              try {
                await Transcript.findOneAndUpdate(
                  { callId: new mongoose.Types.ObjectId(callObjectId) },
                  {
                    $set: {
                      organizationId: orgId,
                      callId: new mongoose.Types.ObjectId(callObjectId),
                      bolnaExecutionId: execId,
                      agentId: agent._id,
                      summary: transcriptObj.summary,
                      rawText: transcriptObj.rawText || "",
                      messages: transcriptObj.messages,
                    },
                  },
                  { upsert: true, new: true }
                );
              } catch {
                // Non-fatal if ObjectId refs differ
              }
            }
          }

          // Upsert UsageLedger entry for cost & duration tracking
          if (db && normalized.status === "completed") {
            try {
              await UsageLedger.findOneAndUpdate(
                { bolnaExecutionId: execId },
                {
                  $set: {
                    organizationId: orgId,
                    bolnaExecutionId: execId,
                    eventType:
                      normalized.direction === "web_call"
                        ? "web_call_test"
                        : "outbound_call",
                    durationSeconds: normalized.duration_seconds || 0,
                    cost: normalized.total_cost || 0,
                    currency: "USD",
                    isSimulated: false,
                    recordedAt: normalized.created_at
                      ? new Date(normalized.created_at)
                      : new Date(),
                  },
                },
                { upsert: true }
              );
            } catch {
              // Ignore duplicate ledger warnings
            }
          }
        }
      } catch (execErr: any) {
        errors.push(
          `Call sync for agent "${agent.name}" (${agent.bolnaAgentId}): ${
            execErr?.message || "Failed"
          }`
        );
      }
    }
  }

  const summary = setSyncState({
    lastSyncedAt: new Date().toISOString(),
    importedAgents,
    updatedAgents,
    pushedAgents,
    syncedCalls,
    updatedCalls,
    errors,
  });

  return {
    success: errors.length === 0,
    mode: "live",
    message: `Synchronized ${importedAgents} new agent(s), ${updatedAgents} existing agent(s), ${pushedAgents} pushed agent(s), and ${
      syncedCalls + updatedCalls
    } call execution(s) with Bolna AI.`,
    summary,
    agents: getAgents(),
  };
}
