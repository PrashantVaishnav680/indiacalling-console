import {
  BolnaAgentConfig,
  BolnaAgentResponse,
  BolnaCallDetails,
  BolnaCallRequest,
  BolnaCallResponse,
  BolnaExecutionRecord,
} from "./types";
import { sanitizeBolnaVoiceSelection } from "@/lib/voice-registry";

/**
 * Official Bolna AI v2 Server-Side Service Layer (`src/lib/bolna/client.ts`)
 * Grounded in Official Bolna Documentation:
 *  - Base URL: https://api.bolna.ai (auto-migrates legacy https://api.bolna.dev)
 *  - Agents v2: POST /v2/agent, GET /v2/agent/all, GET /v2/agent/{id}, PUT /v2/agent/{id}, PATCH /v2/agent/{id}, DELETE /v2/agent/{id}
 *  - Executions: GET /v2/agent/{agent_id}/executions, GET /executions/{execution_id}
 *  - Outbound Calls: POST /call
 *  - Web-Call SDK Session Minting: POST /web-call/session (with fallback to /web-call/freeswitch-session)
 */

function resolveBolnaBaseUrl(): string {
  const raw = (process.env.BOLNA_BASE_URL || "https://api.bolna.ai").trim().replace(/\/$/, "");
  // Automatically upgrade legacy api.bolna.dev to the official production api.bolna.ai endpoint
  if (raw === "https://api.bolna.dev" || raw === "http://api.bolna.dev") {
    return "https://api.bolna.ai";
  }
  return raw;
}

export function resolveIsoLanguageCode(languageLabel?: string): string {
  const lower = String(languageLabel || "en").toLowerCase();
  if (lower.includes("hindi") || lower === "hi" || lower === "hi-in") return "hi";
  if (lower.includes("tamil") || lower === "ta") return "ta";
  if (lower.includes("telugu") || lower === "te") return "te";
  if (lower.includes("gujarati") || lower === "gu") return "gu";
  if (lower.includes("marathi") || lower === "mr") return "mr";
  if (lower.includes("bengali") || lower === "bn") return "bn";
  return "en";
}

export function normalizeIndianPhoneE164(rawPhone: string): string {
  const stripped = String(rawPhone || "").replace(/[\s\-().]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(stripped)) return stripped;
  if (/^[6-9]\d{9}$/.test(stripped)) return `+91${stripped}`;
  if (/^91[6-9]\d{9}$/.test(stripped)) return `+${stripped}`;
  if (/^0[6-9]\d{9}$/.test(stripped)) return `+91${stripped.slice(1)}`;
  return stripped.startsWith("+") ? stripped : `+91${stripped}`;
}

/**
 * Formats a date into ISO 8601 with an explicit numeric UTC offset (`+00:00`),
 * which Bolna Batch Schedule API requires (the `Z` suffix is rejected with HTTP 500).
 * Ensures the timestamp is at least 3 minutes in the future.
 */
export function formatBolnaScheduledAt(input?: string | Date): string {
  const minFutureMs = Date.now() + 3 * 60 * 1000;
  let targetDate = input ? new Date(input) : new Date(minFutureMs);
  if (isNaN(targetDate.getTime()) || targetDate.getTime() < minFutureMs) {
    targetDate = new Date(minFutureMs);
  }
  return targetDate.toISOString().replace(/\.\d{3}Z$/, "+00:00").replace(/Z$/, "+00:00");
}


export interface ExtractedQualificationResult {
  isQualified: boolean;
  leadStatus: string;
  score: number;
  interestLevel: "high" | "medium" | "low";
  budget?: string;
  timeline?: string;
  location?: string;
  reason: string;
  customerName?: string;
  nextAction?: string;
}

export function extractBolnaQualification(
  extractedData: any,
  rawSummary?: string | null
): ExtractedQualificationResult {
  if (!extractedData || typeof extractedData !== "object") {
    return {
      isQualified: false,
      leadStatus: "UNKNOWN",
      score: 50,
      interestLevel: "medium",
      reason: rawSummary || "Call recorded without structured extraction",
    };
  }

  const lq = extractedData["Lead Qualification"] || {};
  const cd = extractedData["Customer Details"] || {};
  const bfr = extractedData["Budget & Financial Readiness"] || {};
  const pr = extractedData["Create Property Requirements"] || {};
  const gen = extractedData["General"] || {};

  const rawStatus =
    lq.lead_status?.objective ||
    extractedData.lead_status ||
    extractedData.qualification_status ||
    "";
  const statusStr = String(rawStatus).toUpperCase().trim();

  const isHot = statusStr === "HOT";
  const isWarm = statusStr === "WARM";
  const isExplicitQual =
    Boolean(extractedData.lead_qualified) ||
    Boolean(extractedData.qualified) ||
    statusStr === "QUALIFIED";

  const nextActionStr = String(
    lq.next_action?.objective || extractedData.next_action || ""
  );
  const hasSiteVisit =
    nextActionStr.toLowerCase().includes("site visit") ||
    nextActionStr.toLowerCase().includes("arrange") ||
    nextActionStr.toLowerCase().includes("priority") ||
    nextActionStr.toLowerCase().includes("follow-up") ||
    nextActionStr.toLowerCase().includes("followup");

  const summaryText = String(
    gen["Call Summary"]?.subjective || rawSummary || extractedData.summary || ""
  ).toLowerCase();
  const hasNegativeSignal =
    summaryText.includes("not interested") ||
    summaryText.includes("no interest") ||
    summaryText.includes("declined") ||
    summaryText.includes("refused") ||
    summaryText.includes("wrong number") ||
    summaryText.includes("do not call") ||
    statusStr === "COLD" ||
    statusStr === "LOST" ||
    statusStr === "UNQUALIFIED";
  const hasPositiveSummaryIntent =
    !hasNegativeSignal &&
    (summaryText.includes("expressed interest") ||
      summaryText.includes("agreed to schedule") ||
      summaryText.includes("schedule a follow-up") ||
      summaryText.includes("arranging the meeting") ||
      summaryText.includes("site visit") ||
      summaryText.includes("finalize the purchase") ||
      summaryText.includes("confirmed a flexible") ||
      summaryText.includes("willingness to visit"));

  const isQualified =
    isHot ||
    isWarm ||
    isExplicitQual ||
    (!hasNegativeSignal && (hasSiteVisit || hasPositiveSummaryIntent));

  const rawBudget =
    bfr.customer_budget?.subjective ||
    bfr.customer_budget?.objective ||
    extractedData.customer_budget ||
    extractedData.budget;
  const budget =
    rawBudget &&
    !String(rawBudget).toLowerCase().includes("did not disclose") &&
    !String(rawBudget).toLowerCase().includes("not mention")
      ? String(rawBudget)
      : undefined;

  const rawTimeline =
    bfr.purchase_timeline?.objective ||
    bfr.purchase_timeline?.subjective ||
    extractedData.purchase_timeline ||
    extractedData.timeline;
  const timeline =
    rawTimeline &&
    rawTimeline !== "Unknown" &&
    !String(rawTimeline).toLowerCase().includes("not provide")
      ? String(rawTimeline)
      : undefined;

  const rawLocation =
    pr.preferred_location?.subjective ||
    pr.preferred_location?.objective ||
    extractedData.preferred_location ||
    extractedData.location;
  const location =
    rawLocation &&
    rawLocation !== "Not Mentioned" &&
    !String(rawLocation).toLowerCase().includes("did not explicitly")
      ? String(rawLocation)
      : undefined;

  const rawCustomerName =
    cd.customer_name?.subjective ||
    cd.customer_name?.objective ||
    extractedData.customer_name;
  let cleanedName = rawCustomerName ? String(rawCustomerName).replace(/^[:\s-]+/, "").trim() : "";
  const isNameInvalid =
    !cleanedName ||
    cleanedName.toLowerCase() === "null" ||
    cleanedName.toLowerCase() === "none" ||
    cleanedName.toLowerCase() === "unknown" ||
    cleanedName.toLowerCase().includes("null") ||
    cleanedName.toLowerCase().includes("did not mention") ||
    cleanedName.includes("एस्टेड") ||
    cleanedName.length < 2;
  const customerName = !isNameInvalid ? cleanedName : undefined;

  const reason =
    lq.lead_status?.reasoning_objective ||
    lq.next_action?.reasoning_objective ||
    gen["Call Summary"]?.subjective ||
    rawSummary ||
    extractedData.summary ||
    (isQualified
      ? "Prospect showed positive buying intent and interest during conversation"
      : "Conversation completed");

  const score = isHot ? 92 : isWarm ? 78 : isQualified ? (hasPositiveSummaryIntent && !isExplicitQual && !hasSiteVisit ? 80 : 85) : 45;
  const interestLevel: "high" | "medium" | "low" = isHot
    ? "high"
    : isWarm
    ? "medium"
    : isQualified
    ? (hasPositiveSummaryIntent && !isExplicitQual && !hasSiteVisit ? "medium" : "high")
    : "low";

  // Strict consistency: Low interest can NEVER be qualified
  const finalIsQualified = interestLevel === "low" ? false : isQualified;
  return {
    isQualified: finalIsQualified,
    leadStatus: statusStr || (finalIsQualified ? "QUALIFIED" : "FOLLOW_UP"),
    score: Number(extractedData.qualification_score || (finalIsQualified ? score : Math.min(score, 45))),
    interestLevel,
    budget,
    timeline,
    location,
    reason: String(reason || ""),
    customerName,
    nextAction: nextActionStr || undefined,
  };
}

/**
 * Strict Lead Qualification Gate:
 * Prevents leads from ever being marked "qualified" without an actual completed call
 * of meaningful duration (>= 10 seconds) and positive extraction signals.
 */
export function evaluateLeadQualification(params: {
  callStatus?: string | null;
  durationSeconds?: number | null;
  extractedData?: any;
  summary?: string | null;
}): ExtractedQualificationResult {
  const normalizedStatus = normalizeBolnaStatus(params.callStatus || "initiated");
  const duration = Math.max(0, Number(params.durationSeconds || 0));

  if (normalizedStatus !== "completed" || duration < 10) {
    return {
      isQualified: false,
      leadStatus: normalizedStatus === "completed" ? "SHORT_CALL" : "NOT_CONNECTED",
      score: 0,
      interestLevel: "low",
      reason:
        normalizedStatus !== "completed"
          ? `Call did not complete (status: ${normalizedStatus}). Qualification requires a completed conversation.`
          : `Call duration (${duration}s) was too short for qualification.`,
    };
  }

  return extractBolnaQualification(params.extractedData, params.summary);
}


export function parseBolnaTranscriptToMessages(
  rawTranscript:
    | string
    | Array<{ speaker?: string; text?: string; message?: string; timestamp?: string | number }>
    | undefined
    | null
): Array<{
  speaker: "agent" | "customer" | "system";
  text: string;
  timestamp: string;
}> {
  if (!rawTranscript) return [];

  if (Array.isArray(rawTranscript)) {
    return rawTranscript
      .map((item, idx) => {
        const rawSpeaker = String(item.speaker || "agent").toLowerCase();
        const speaker: "agent" | "customer" | "system" =
          rawSpeaker.includes("assistant") || rawSpeaker.includes("agent") || rawSpeaker.includes("bot")
            ? "agent"
            : rawSpeaker.includes("system")
            ? "system"
            : "customer";
        const mins = Math.floor((idx * 5) / 60)
          .toString()
          .padStart(2, "0");
        const secs = ((idx * 5) % 60).toString().padStart(2, "0");
        return {
          speaker,
          text: String(item.text || item.message || "").trim(),
          timestamp: item.timestamp ? String(item.timestamp) : `${mins}:${secs}`,
        };
      })
      .filter((m) => m.text.length > 0);
  }

  const lines = String(rawTranscript)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let elapsedSec = 2;
  return lines.map((line) => {
    let speaker: "agent" | "customer" | "system" = "agent";
    let text = line;

    if (/^(assistant|agent|bot|ai)\s*:/i.test(line)) {
      speaker = "agent";
      text = line.replace(/^(assistant|agent|bot|ai)\s*:\s*/i, "");
    } else if (/^(user|customer|caller|human)\s*:/i.test(line)) {
      speaker = "customer";
      text = line.replace(/^(user|customer|caller|human)\s*:\s*/i, "");
    }

    const mins = Math.floor(elapsedSec / 60)
      .toString()
      .padStart(2, "0");
    const secs = (elapsedSec % 60).toString().padStart(2, "0");
    const timestamp = `${mins}:${secs}`;
    elapsedSec += Math.max(4, Math.ceil(text.split(/\s+/).length * 0.45));

    return { speaker, text, timestamp };
  });
}

export function normalizeBolnaStatus(rawStatus?: string):
  | "queued"
  | "initiated"
  | "ringing"
  | "answered"
  | "in_progress"
  | "completed"
  | "no_answer"
  | "busy"
  | "failed"
  | "cancelled" {
  const s = String(rawStatus || "initiated").toLowerCase().trim();
  if (s === "queued" || s === "scheduled" || s === "rescheduled") return "queued";
  if (s === "initiated") return "initiated";
  if (s === "ringing") return "ringing";
  if (s === "in-progress" || s === "in_progress" || s === "call-disconnected") return "in_progress";
  if (s === "completed" || s === "call_completed") return "completed";
  if (s === "no-answer" || s === "no_answer") return "no_answer";
  if (s === "busy") return "busy";
  if (s === "canceled" || s === "cancelled" || s === "stopped") return "cancelled";
  if (s === "failed" || s === "error" || s === "balance-low") return "failed";
  return "initiated";
}

class BolnaService {
  get apiKey(): string {
    return (process.env.BOLNA_API_KEY || "").trim();
  }

  get baseUrl(): string {
    return resolveBolnaBaseUrl();
  }

  get hasValidApiKey(): boolean {
    const key = this.apiKey;
    return Boolean(
      key &&
        key.length > 10 &&
        !key.includes("mock") &&
        !key.includes("placeholder") &&
        !key.includes("your_bolna_api_key")
    );
  }

  /**
   * Returns true only when no valid BOLNA_API_KEY is configured.
   * If a real BOLNA_API_KEY is present, live Bolna operations are enabled unless explicitly overridden.
   */
  get isMockMode(): boolean {
    if (!this.hasValidApiKey) {
      return true;
    }
    return false;
  }

  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Constructs the official Bolna API v2 agent payload (`{ agent_config, agent_prompts }`)
   * used by both `POST /v2/agent` (Create) and `PUT /v2/agent/{id}` (Update).
   */
  buildV2AgentPayload(config: BolnaAgentConfig): Record<string, any> {
    const aiHangupEnabled = config.aiHangupEnabled ?? true;
    let systemPrompt =
      config.llm_config?.system_prompt ||
      "You are a professional and polite AI voice assistant for IndiaCalling Console.";

    if (aiHangupEnabled === false) {
      systemPrompt +=
        "\n\n[Call Disconnect Policy]: AI Hangup is DISABLED. Never hang up or disconnect the call yourself. Always wait patiently for the caller to disconnect.";
    } else {
      systemPrompt +=
        "\n\n[Call Disconnect Policy]: AI Hangup is ENABLED. You are authorized to politely conclude the conversation and hang up the call once the qualification or objective is complete, or when the customer says goodbye.";
    }

    const isoLang = resolveIsoLanguageCode(
      config.transcriber_config?.language || config.synthesizer_config?.language || "en"
    );

    // Sanitize voice provider, model, and voice_id against Bolna v2 active voice catalog
    const safeVoice = sanitizeBolnaVoiceSelection({
      provider: config.synthesizer_config?.provider,
      voiceId: config.synthesizer_config?.voice_id,
      voiceName: config.synthesizer_config?.voiceName,
      model: config.synthesizer_config?.model,
      isoLanguage: isoLang,
    });
    const synthesizerProvider = safeVoice.provider;

    const synthesizerProviderConfig: Record<string, any> = {
      model: safeVoice.model,
      voice: safeVoice.voiceName,
      voice_id: safeVoice.voiceId,
    };

    if (synthesizerProvider === "sarvam") {
      synthesizerProviderConfig.language = isoLang;
      synthesizerProviderConfig.speed = Number(config.synthesizer_config?.speed ?? 1.0);
    } else if (
      ["cartesia", "smallest", "rime", "azuretts", "polly", "soniox", "navana"].includes(
        synthesizerProvider
      )
    ) {
      synthesizerProviderConfig.language = isoLang;
    }

    // Resolve Indian regional languages on transcriber: Deepgram nova-2 rejects gu/mr/ta/te/bn/kn/ml/od
    const REGIONAL_INDIC_CODES = new Set(["gu", "mr", "ta", "te", "bn", "kn", "ml", "od", "pa"]);
    const requestedTranscriberProvider = (config.transcriber_config?.provider || "deepgram").toLowerCase();
    const useSarvamTranscriber =
      requestedTranscriberProvider.includes("sarvam") ||
      (REGIONAL_INDIC_CODES.has(isoLang) && requestedTranscriberProvider === "deepgram");
    const transcriberBlock: Record<string, any> = useSarvamTranscriber
      ? {
          provider: "sarvam",
          model: "saaras:v4",
          language: isoLang,
          stream: true,
          endpointing: 400,
        }
      : {
          provider: config.transcriber_config?.provider || "deepgram",
          model: config.transcriber_config?.model || "nova-2",
          language: isoLang,
          stream: true,
          encoding: "linear16",
          sampling_rate: 16000,
          endpointing: 250,
        };

    // Wire Live Call Transfer (`transfer_call`) tool when enabled with a destination number
    const transferEnabled = Boolean(
      config.call_transfer_config?.enabled &&
        String(config.call_transfer_config?.destination_number || "").trim().length >= 8
    );
    const normalizedTransferNumber = transferEnabled
      ? normalizeIndianPhoneE164(String(config.call_transfer_config!.destination_number))
      : "";
    const transferDept = config.call_transfer_config?.department || "Sales Desk";
    const preTransferMessage =
      config.call_transfer_config?.pre_transfer_message ||
      `Sure, I am transferring your call to our ${transferDept} specialist now. Please hold for a moment.`;

    if (transferEnabled && normalizedTransferNumber) {
      systemPrompt += `\n\n[Live Call Transfer Enabled]: You have the transfer_call tool wired to ${transferDept} (${normalizedTransferNumber}). As soon as the caller asks to speak with a human, real person, manager, or requests transfer, IMMEDIATELY invoke the transfer_call tool in that exact turn without asking extra questions or delaying. Never only say you are transferring without calling transfer_call.`;
    }

    const apiToolsBlock =
      transferEnabled && normalizedTransferNumber
        ? {
            tools: [
              {
                key: "transfer_call",
                name: "transfer_call",
                description: `Transfer the live phone call immediately to a human representative (${transferDept}) whenever the caller asks for a human, real person, escalation, or live sales handoff.`,
                pre_call_message: preTransferMessage,
                parameters: {
                  type: "object",
                  properties: {},
                  required: [],
                },
              },
            ],
            tools_params: {
              transfer_call: {
                call_transfer_number: normalizedTransferNumber,
                param: {
                  call_transfer_number: normalizedTransferNumber,
                },
              },
            },
          }
        : undefined;

    const telephonyProvider = config.telephony_config?.provider || "plivo";
    const webhookUrl =
      config.webhook_url ||
      `${process.env.NEXT_PUBLIC_APP_URL || "https://console.indiacalling.ai"}/api/webhooks/bolna`;

    return {
      agent_config: {
        agent_name: config.agent_name,
        agent_type: config.agent_type || "other",
        agent_welcome_message: config.agent_welcome_message || "Hello! How can I help you today?",
        webhook_url: webhookUrl,
        ...(config.calling_guardrails
          ? { calling_guardrails: config.calling_guardrails }
          : {}),
        call_summary_enabled: config.call_summary_enabled ?? true,
        tasks: [
          {
            task_type: "conversation",
            toolchain: {
              execution: "sequential",
              pipelines: [["transcriber", "llm", "synthesizer"]],
            },
            task_config: {
              hangup_after_silence:
                transferEnabled || aiHangupEnabled === false
                  ? Math.max(45, Number(config.telephony_config?.hangup_after_silence || 45))
                  : Math.max(15, Number(config.telephony_config?.hangup_after_silence || 15)),
              call_terminate: config.telephony_config?.max_duration_seconds || 300,
              incremental_delay: 400,
              number_of_words_for_interruption: 2,
              check_if_user_online: transferEnabled ? false : true,
              trigger_user_online_message_after: transferEnabled ? 30 : 15,
            },
            tools_config: {
              input: { format: "wav", provider: telephonyProvider },
              output: { format: "wav", provider: telephonyProvider },
              llm_agent: {
                agent_type: "simple_llm_agent",
                agent_flow_type: "streaming",
                llm_config: {
                  model: config.llm_config?.model || "gpt-4o-mini",
                  provider: config.llm_config?.provider || "openai",
                  max_tokens: config.llm_config?.max_tokens || 200,
                  temperature: config.llm_config?.temperature ?? 0.3,
                },
              },
              synthesizer: {
                provider: synthesizerProvider,
                provider_config: synthesizerProviderConfig,
                stream: true,
                buffer_size: synthesizerProvider === "sarvam" ? 150 : 250,
                ...(synthesizerProvider === "sarvam" ? {} : { audio_format: "wav" }),
              },
              transcriber: transcriberBlock,
              ...(apiToolsBlock ? { api_tools: apiToolsBlock } : {}),
            },
          },
        ],
      },
      agent_prompts: {
        task_1: {
          system_prompt: systemPrompt,
        },
      },
    };
  }

  /**
   * 0. Health Check & Account / Agent Connectivity Verification
   */
  async checkHealth(): Promise<{
    connected: boolean;
    mode: "mock" | "live";
    status: string;
    details?: string;
    remoteAgentCount?: number;
    walletBalance?: number | string | null;
    accountInfo?: Record<string, any> | null;
  }> {
    if (this.isMockMode) {
      return {
        connected: true,
        mode: "mock",
        status: "Voice AI Engine API Key Not Configured",
        details:
          "Configure your Voice AI Engine API key in .env.local to connect your live voice account, import agents, and run WebRTC Browser Voice Tests or Outbound Test Calls.",
        remoteAgentCount: 0,
        walletBalance: null,
        accountInfo: null,
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v2/agent/all`, {
        method: "GET",
        headers: this.getHeaders(),
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        return {
          connected: false,
          mode: "live",
          status: "Authentication Failed (HTTP 401)",
          details:
            "BOLNA_API_KEY was rejected by Bolna. Verify your Bearer API key in the Bolna Developers dashboard.",
        };
      }

      if (!response.ok) {
        const errText = await response.text();
        return {
          connected: false,
          mode: "live",
          status: `Bolna API HTTP ${response.status}`,
          details: errText || "Bolna API returned an unexpected status code.",
        };
      }

      const agentsData = await response.json();
      const agentArray = Array.isArray(agentsData)
        ? agentsData
        : Array.isArray(agentsData?.data)
        ? agentsData.data
        : Array.isArray(agentsData?.agents)
        ? agentsData.agents
        : [];

      // Optionally query user/wallet info if available on account
      let walletBalance: number | string | null = null;
      let accountInfo: Record<string, any> | null = null;
      try {
        const meRes = await fetch(`${this.baseUrl}/me`, {
          method: "GET",
          headers: this.getHeaders(),
          cache: "no-store",
        });
        if (meRes.ok) {
          accountInfo = await meRes.json();
          walletBalance =
            accountInfo?.wallet ??
            accountInfo?.balance ??
            accountInfo?.credits ??
            null;
        }
      } catch {
        // /me is optional depending on Bolna API tier
      }

      return {
        connected: true,
        mode: "live",
        status: "Connected to Bolna AI (Live v2 API)",
        details: `Successfully authenticated with ${this.baseUrl}. Found ${agentArray.length} voice agent(s) in your Bolna account.`,
        remoteAgentCount: agentArray.length,
        walletBalance,
        accountInfo,
      };
    } catch (error: any) {
      return {
        connected: false,
        mode: "live",
        status: "Connection Error",
        details: error?.message || "Could not reach Bolna API server.",
      };
    }
  }

  /**
   * 1. Create Agent (`POST /v2/agent`)
   */
  async createAgent(
    config: BolnaAgentConfig,
    options?: { forceSimulated?: boolean }
  ): Promise<BolnaAgentResponse> {
    if (this.isMockMode || options?.forceSimulated) {
      return {
        agent_id: `bolna_sim_${Date.now().toString(36)}`,
        version_id: `ver_sim_${Date.now().toString(36)}`,
        agent_name: config.agent_name,
        status: "created",
        created_at: new Date().toISOString(),
        simulated: true,
      };
    }

    const v2Payload = this.buildV2AgentPayload(config);

    const response = await fetch(`${this.baseUrl}/v2/agent`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(v2Payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (
        response.status === 400 &&
        /pre_call_message|api_tools|transfer_call/i.test(errText) &&
        v2Payload.agent_config?.tasks?.[0]?.tools_config?.api_tools?.tools?.[0]?.pre_call_message
      ) {
        // Retry without optional pre_call_message while keeping transfer_call intact
        const retryPayload = JSON.parse(JSON.stringify(v2Payload));
        delete retryPayload.agent_config.tasks[0].tools_config.api_tools.tools[0].pre_call_message;
        const retryRes = await fetch(`${this.baseUrl}/v2/agent`, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(retryPayload),
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          return {
            agent_id: retryData.agent_id || retryData.id,
            version_id: retryData.version_id,
            agent_name: config.agent_name,
            status: retryData.state || retryData.status || "created",
            created_at: new Date().toISOString(),
            raw: retryData,
            simulated: false,
          };
        }
      }
      throw new Error(`Bolna createAgent failed (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    return {
      agent_id: data.agent_id || data.id,
      version_id: data.version_id,
      agent_name: config.agent_name,
      status: data.state || data.status || "created",
      created_at: new Date().toISOString(),
      raw: data,
      simulated: false,
    };
  }

  /**
   * 2. Update Existing Agent in Bolna (`PUT /v2/agent/{agent_id}` with `PATCH /v2/agent/{agent_id}` fallback)
   * NEVER creates a duplicate agent when editing an existing agent.
   */
  async updateAgent(
    bolnaAgentId: string,
    config: BolnaAgentConfig
  ): Promise<BolnaAgentResponse> {
    if (this.isMockMode || bolnaAgentId.startsWith("bolna_sim_") || bolnaAgentId.startsWith("bolna_agent_")) {
      return {
        agent_id: bolnaAgentId,
        agent_name: config.agent_name,
        status: "updated",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        simulated: true,
      };
    }

    const fullV2Payload = this.buildV2AgentPayload(config);

    // Attempt full v2 PUT update first
    const putResponse = await fetch(
      `${this.baseUrl}/v2/agent/${encodeURIComponent(bolnaAgentId)}`,
      {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(fullV2Payload),
      }
    );

    if (putResponse.ok) {
      const data = await putResponse.json();
      return {
        agent_id: data.agent_id || bolnaAgentId,
        version_id: data.version_id,
        agent_name: config.agent_name,
        status: data.state || "updated",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        raw: data,
        simulated: false,
      };
    }

    const putErrText = await putResponse.text().catch(() => "");
    console.warn(
      `[Bolna PUT /v2/agent/${bolnaAgentId}] Attempt 1 failed (HTTP ${putResponse.status}):`,
      putErrText.slice(0, 500)
    );

    const hasTransferTool = Boolean(
      fullV2Payload.agent_config?.tasks?.[0]?.tools_config?.api_tools
    );

    // Attempt 2: Retry PUT without optional pre_call_message if rejected
    if (
      hasTransferTool &&
      fullV2Payload.agent_config?.tasks?.[0]?.tools_config?.api_tools?.tools?.[0]?.pre_call_message
    ) {
      const retryPutPayload = JSON.parse(JSON.stringify(fullV2Payload));
      delete retryPutPayload.agent_config.tasks[0].tools_config.api_tools.tools[0].pre_call_message;
      const retryPutRes = await fetch(
        `${this.baseUrl}/v2/agent/${encodeURIComponent(bolnaAgentId)}`,
        {
          method: "PUT",
          headers: this.getHeaders(),
          body: JSON.stringify(retryPutPayload),
        }
      );
      if (retryPutRes.ok) {
        const data = await retryPutRes.json();
        return {
          agent_id: data.agent_id || bolnaAgentId,
          version_id: data.version_id,
          agent_name: config.agent_name,
          status: data.state || "updated",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          raw: data,
          simulated: false,
        };
      }
      const retryErr = await retryPutRes.text().catch(() => "");
      console.warn(
        `[Bolna PUT /v2/agent/${bolnaAgentId}] Attempt 2 (stringified tools) failed (HTTP ${retryPutRes.status}):`,
        retryErr.slice(0, 500)
      );
    }

    // Attempt 3: Fetch live Bolna agent config via GET, merge task_config + api_tools + prompts onto Bolna's exact schema, and PUT back
    try {
      const liveAgent = await this.getAgent(bolnaAgentId);
      if (liveAgent && typeof liveAgent === "object") {
        const mergedAgentConfig = JSON.parse(
          JSON.stringify(liveAgent.agent_config || liveAgent)
        );
        mergedAgentConfig.agent_name = fullV2Payload.agent_config.agent_name;
        mergedAgentConfig.agent_welcome_message =
          fullV2Payload.agent_config.agent_welcome_message;
        mergedAgentConfig.webhook_url = fullV2Payload.agent_config.webhook_url;
        if (Array.isArray(mergedAgentConfig.tasks) && mergedAgentConfig.tasks[0]) {
          mergedAgentConfig.tasks[0].task_config = {
            ...(mergedAgentConfig.tasks[0].task_config || {}),
            ...fullV2Payload.agent_config.tasks[0].task_config,
          };
          mergedAgentConfig.tasks[0].tools_config = {
            ...(mergedAgentConfig.tasks[0].tools_config || {}),
            api_tools:
              fullV2Payload.agent_config.tasks[0].tools_config.api_tools || null,
          };
        }

        const mergedPayloads = [
          { agent_config: mergedAgentConfig, agent_prompts: fullV2Payload.agent_prompts },
        ];
        if (
          hasTransferTool &&
          mergedAgentConfig.tasks?.[0]?.tools_config?.api_tools?.tools?.[0]?.pre_call_message
        ) {
          const noPreMsgMerged = JSON.parse(JSON.stringify(mergedAgentConfig));
          delete noPreMsgMerged.tasks[0].tools_config.api_tools.tools[0].pre_call_message;
          mergedPayloads.push({
            agent_config: noPreMsgMerged,
            agent_prompts: fullV2Payload.agent_prompts,
          });
        }

        for (const candidate of mergedPayloads) {
          const mergeRes = await fetch(
            `${this.baseUrl}/v2/agent/${encodeURIComponent(bolnaAgentId)}`,
            {
              method: "PUT",
              headers: this.getHeaders(),
              body: JSON.stringify(candidate),
            }
          );
          if (mergeRes.ok) {
            const data = await mergeRes.json();
            return {
              agent_id: data.agent_id || bolnaAgentId,
              version_id: data.version_id,
              agent_name: config.agent_name,
              status: data.state || "updated",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              raw: data,
              simulated: false,
            };
          }
          const mergeErr = await mergeRes.text().catch(() => "");
          console.warn(
            `[Bolna PUT /v2/agent/${bolnaAgentId}] Merge-PUT failed (HTTP ${mergeRes.status}):`,
            mergeErr.slice(0, 500)
          );
        }
      }
    } catch (mergeEx: any) {
      console.warn("[Bolna Merge-PUT] error:", mergeEx?.message);
    }

    // Do NOT silently fall back to PATCH when live call transfer is enabled,
    // because Bolna's PATCH endpoint ignores `tasks` (both `api_tools` and `task_config`).
    if (hasTransferTool) {
      throw new Error(
        `Bolna rejected PUT /v2/agent/${bolnaAgentId} (HTTP ${putResponse.status}): ${putErrText || "Could not sync transfer_call tool and silence timers."}`
      );
    }

    // Fallback to official Bolna v2 PATCH endpoint for partial attribute updates (when transfer_call is not enabled)
    const patchPayload = {
      agent_config: {
        agent_name: fullV2Payload.agent_config.agent_name,
        agent_welcome_message: fullV2Payload.agent_config.agent_welcome_message,
        webhook_url: fullV2Payload.agent_config.webhook_url,
        synthesizer: fullV2Payload.agent_config.tasks[0].tools_config.synthesizer,
        calling_guardrails: fullV2Payload.agent_config.calling_guardrails,
        call_summary_enabled: fullV2Payload.agent_config.call_summary_enabled,
      },
      agent_prompts: fullV2Payload.agent_prompts,
    };

    const patchResponse = await fetch(
      `${this.baseUrl}/v2/agent/${encodeURIComponent(bolnaAgentId)}`,
      {
        method: "PATCH",
        headers: this.getHeaders(),
        body: JSON.stringify(patchPayload),
      }
    );

    if (!patchResponse.ok) {
      const errText = await patchResponse.text();
      throw new Error(
        `Bolna updateAgent failed (HTTP ${patchResponse.status}): ${errText}`
      );
    }

    const patchData = await patchResponse.json();
    return {
      agent_id: patchData.agent_id || bolnaAgentId,
      version_id: patchData.version_id,
      agent_name: config.agent_name,
      status: patchData.state || "updated",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      raw: patchData,
      simulated: false,
    };
  }

  /**
   * 3. List All Voice AI Agents from Bolna (`GET /v2/agent/all`)
   */
  async listAgents(): Promise<any[]> {
    if (this.isMockMode) return [];

    const response = await fetch(`${this.baseUrl}/v2/agent/all`, {
      method: "GET",
      headers: this.getHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Bolna listAgents failed (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.agents)) return data.agents;
    return [];
  }

  /**
   * 4. Retrieve Single Agent Details from Bolna (`GET /v2/agent/{agent_id}`)
   */
  async getAgent(bolnaAgentId: string): Promise<any> {
    if (this.isMockMode || bolnaAgentId.startsWith("bolna_sim_")) {
      return {
        id: bolnaAgentId,
        agent_id: bolnaAgentId,
        agent_name: "Simulated Agent",
        status: "active",
      };
    }

    const response = await fetch(
      `${this.baseUrl}/v2/agent/${encodeURIComponent(bolnaAgentId)}`,
      {
        method: "GET",
        headers: this.getHeaders(),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Bolna getAgent failed (HTTP ${response.status}): ${errText}`);
    }

    return response.json();
  }

  /**
   * 5. Delete Agent on Bolna (`DELETE /v2/agent/{agent_id}`)
   */
  async deleteAgent(bolnaAgentId: string): Promise<boolean> {
    if (this.isMockMode || !bolnaAgentId || bolnaAgentId.startsWith("bolna_sim_")) {
      return true;
    }

    const response = await fetch(
      `${this.baseUrl}/v2/agent/${encodeURIComponent(bolnaAgentId)}`,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      }
    );

    return response.ok || response.status === 404;
  }

  /**
   * 6. Retrieve All Executions for a Bolna Agent (`GET /v2/agent/{agent_id}/executions`)
   */
  async getAgentExecutions(
    bolnaAgentId: string,
    options?: {
      pageNumber?: number;
      pageSize?: number;
      status?: string;
      fromIso?: string;
      toIso?: string;
    }
  ): Promise<BolnaExecutionRecord[]> {
    if (
      this.isMockMode ||
      !bolnaAgentId ||
      bolnaAgentId.startsWith("bolna_sim_") ||
      bolnaAgentId.startsWith("bolna_agent_")
    ) {
      return [];
    }

    const params = new URLSearchParams();
    params.set("page_size", String(Math.min(options?.pageSize || 50, 50)));
    if (options?.pageNumber) params.set("page_number", String(options.pageNumber));
    if (options?.status) params.set("status", options.status);
    if (options?.fromIso && options?.toIso) {
      params.set("from", options.fromIso);
      params.set("to", options.toIso);
    }

    const url = `${this.baseUrl}/v2/agent/${encodeURIComponent(
      bolnaAgentId
    )}/executions?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      // Try without query params if date filter was rejected
      const fallbackRes = await fetch(
        `${this.baseUrl}/v2/agent/${encodeURIComponent(bolnaAgentId)}/executions`,
        {
          method: "GET",
          headers: this.getHeaders(),
          cache: "no-store",
        }
      );
      if (!fallbackRes.ok) {
        const errText = await fallbackRes.text();
        throw new Error(
          `Bolna getAgentExecutions failed (HTTP ${fallbackRes.status}): ${errText}`
        );
      }
      const fallbackData = await fallbackRes.json();
      return Array.isArray(fallbackData)
        ? fallbackData
        : Array.isArray(fallbackData?.data)
        ? fallbackData.data
        : Array.isArray(fallbackData?.executions)
        ? fallbackData.executions
        : [];
    }

    const data = await response.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.executions)) return data.executions;
    return [];
  }

  /**
   * 7. Retrieve Single Execution Details (`GET /executions/{execution_id}`)
   */
  async getCallDetails(executionId: string): Promise<BolnaCallDetails> {
    if (
      this.isMockMode ||
      executionId.startsWith("bolna_call_") ||
      executionId.startsWith("sim_exec_")
    ) {
      return {
        call_id: executionId,
        execution_id: executionId,
        status: "completed",
        duration_seconds: 68,
        total_cost: 0,
        recording_url: "https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg",
        summary:
          "Simulated conversation completed. Customer confirmed interest and qualification criteria.",
        extracted_data: {
          interest_level: "high",
          lead_qualified: true,
          qualification_score: 88,
          customer_budget: "₹45,000 / month",
        },
      };
    }

    const response = await fetch(
      `${this.baseUrl}/executions/${encodeURIComponent(executionId)}`,
      {
        method: "GET",
        headers: this.getHeaders(),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const v2Fallback = await fetch(
        `${this.baseUrl}/v2/executions/${encodeURIComponent(executionId)}`,
        {
          method: "GET",
          headers: this.getHeaders(),
          cache: "no-store",
        }
      );
      if (!v2Fallback.ok) {
        const errText = await response.text();
        throw new Error(
          `Bolna getExecutionDetails failed (HTTP ${response.status}): ${errText}`
        );
      }
      return this.normalizeExecutionPayload(await v2Fallback.json());
    }

    return this.normalizeExecutionPayload(await response.json());
  }

  normalizeExecutionPayload(raw: BolnaExecutionRecord | Record<string, any>): BolnaCallDetails {
    const execId = String(raw.id || raw.execution_id || raw.call_id || "");
    const durationSec = Math.round(
      Number(
        raw.conversation_duration ??
          raw.telephony_data?.duration ??
          raw.duration_seconds ??
          raw.duration ??
          0
      )
    );
    const callTypeRaw = String(
      raw.telephony_data?.call_type || raw.direction || "outbound"
    ).toLowerCase();
    const direction: "inbound" | "outbound" | "web_call" =
      callTypeRaw.includes("inbound")
        ? "inbound"
        : callTypeRaw.includes("web") || raw.telephony_data?.provider === "freeswitch"
        ? "web_call"
        : "outbound";

    const phone =
      raw.user_number ||
      raw.telephony_data?.to_number ||
      raw.recipient_phone_number ||
      (direction === "web_call" ? "Browser Web-Call" : "Unknown");

    const parsedMessages = parseBolnaTranscriptToMessages(raw.transcript);

    return {
      call_id: execId,
      execution_id: execId,
      agent_id: raw.agent_id,
      status: normalizeBolnaStatus(raw.status),
      direction,
      recipient_phone_number: phone,
      duration_seconds: durationSec,
      total_cost: Number(raw.total_cost ?? 0),
      recording_url:
        raw.telephony_data?.recording_url || raw.recording_url || undefined,
      transcript_text:
        typeof raw.transcript === "string"
          ? raw.transcript
          : parsedMessages.map((m) => `${m.speaker}: ${m.text}`).join("\n"),
      transcript: parsedMessages.map((m) => ({
        speaker: m.speaker,
        text: m.text,
        timestamp: m.timestamp,
      })),
      extracted_data: raw.extracted_data || undefined,
      summary:
        raw.summary ||
        raw.extracted_data?.General?.["Call Summary"]?.subjective ||
        undefined,
      termination_reason:
        raw.termination_reason || raw.telephony_data?.hangup_reason || undefined,
      created_at: raw.created_at,
      ended_at: raw.updated_at,
    };
  }

  /**
   * 8. Initiate Outbound Phone Call (`POST /call`)
   * Does not require `from_phone_number` unless explicitly passed; Bolna uses the account's default calling route.
   */
  async initiateCall(
    request: BolnaCallRequest,
    options?: { forceSimulated?: boolean }
  ): Promise<BolnaCallResponse> {
    if (this.isMockMode || options?.forceSimulated) {
      const simId = `sim_exec_${Date.now().toString(36)}`;
      return {
        call_id: simId,
        execution_id: simId,
        status: "queued",
        agent_id: request.agent_id,
        created_at: new Date().toISOString(),
        simulated: true,
      };
    }

    const e164Phone = normalizeIndianPhoneE164(request.recipient_phone_number);

    const payload: Record<string, any> = {
      agent_id: request.agent_id,
      recipient_phone_number: e164Phone,
    };

    // Only include from_phone_number if explicitly provided in E.164 format
    if (
      request.from_phone_number &&
      /^\+[1-9]\d{7,14}$/.test(request.from_phone_number.replace(/[\s\-().]/g, ""))
    ) {
      payload.from_phone_number = request.from_phone_number.replace(/[\s\-().]/g, "");
    }

    if (request.scheduled_at) {
      payload.scheduled_at = request.scheduled_at;
    }
    if (request.user_data && Object.keys(request.user_data).length > 0) {
      payload.user_data = request.user_data;
    }
    if (request.agent_data && Object.keys(request.agent_data).length > 0) {
      payload.agent_data = request.agent_data;
    }
    if (typeof request.bypass_call_guardrails === "boolean") {
      payload.bypass_call_guardrails = request.bypass_call_guardrails;
    }

    const response = await fetch(`${this.baseUrl}/call`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Bolna initiateCall failed (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    const execId = data.execution_id || data.call_id || data.id;
    return {
      call_id: execId,
      execution_id: execId,
      status: data.status || "queued",
      agent_id: request.agent_id,
      created_at: data.created_at || new Date().toISOString(),
      simulated: false,
    };
  }

  /**
   * 9. Mint Short-Lived Single-Use Browser Web-Call Session (`POST /web-call/session`)
   * Official Bolna Web-Call SDK backend proxy (`@bolna/web-call` v3.0.1).
   * Keeps BOLNA_API_KEY strictly on the server; returns ~120s single-use WebRTC session credentials.
   */
  async mintWebCallSession(params: {
    bolnaAgentId?: string;
    agentId?: string;
    userData?: Record<string, any>;
    language?: string;
  }): Promise<{ status: number; data: Record<string, any> }> {
    if (!this.hasValidApiKey) {
      throw new Error(
        "BOLNA_API_KEY is not configured on the server. Browser Voice Test requires a live Bolna API key in .env.local."
      );
    }

    const targetAgentId = params.bolnaAgentId || params.agentId || "";
    const bodyPayload: Record<string, any> = {
      agent_id: targetAgentId,
    };
    if (params.userData && Object.keys(params.userData).length > 0) {
      bodyPayload.user_data = params.userData;
    }
    if (params.language) {
      bodyPayload.agent_data = { language: resolveIsoLanguageCode(params.language) };
    }

    // Official v3 endpoint: POST https://api.bolna.ai/web-call/session
    const primaryRes = await fetch(`${this.baseUrl}/web-call/session`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(bodyPayload),
      cache: "no-store",
    });

    if (primaryRes.ok) {
      return { status: primaryRes.status, data: await primaryRes.json() };
    }

    // Fallback endpoint: POST https://api.bolna.ai/web-call/freeswitch-session
    const fallbackRes = await fetch(`${this.baseUrl}/web-call/freeswitch-session`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(bodyPayload),
      cache: "no-store",
    });

    const text = await fallbackRes.text();
    let parsed: Record<string, any> = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { message: text || `HTTP ${fallbackRes.status}` };
    }

    return { status: fallbackRes.status, data: parsed };
  }

  /**
   * 11. Create a Batch Campaign (`POST /batches`)
   * Uploads contact CSV to Bolna and creates a Campaign Batch linked to the agent.
   * Bolna requires column header `contact_number` formatted in E.164.
   * Never silently fakes success when Bolna rejects the request.
   */
  async createBatchCampaign(params: {
    agentId: string;
    csvContent: string;
    filename?: string;
    fromPhoneNumbers?: string[];
    webhookUrl?: string;
  }): Promise<{
    success: boolean;
    batch_id: string;
    state: string;
    simulated?: boolean;
    error?: string;
    notice?: string;
    [key: string]: any;
  }> {
    if (this.isMockMode) {
      return {
        success: false,
        batch_id: "",
        state: "failed",
        simulated: true,
        error:
          "BOLNA_API_KEY is not configured. Configure a valid Bolna API key to sync campaigns.",
      };
    }

    if (!params.agentId || params.agentId.startsWith("bolna_sim_")) {
      return {
        success: false,
        batch_id: "",
        state: "failed",
        error:
          "The selected AI agent is not synced with Bolna yet. Sync the agent first before creating a Bolna batch campaign.",
      };
    }

    try {
      const formData = new FormData();
      formData.append("agent_id", params.agentId);
      const csvBlob = new Blob([params.csvContent], { type: "text/csv" });
      formData.append("file", csvBlob, params.filename || "contacts.csv");

      if (params.fromPhoneNumbers && params.fromPhoneNumbers.length > 0) {
        params.fromPhoneNumbers.forEach((num, idx) => {
          const normalized = normalizeIndianPhoneE164(num);
          if (/^\+[1-9]\d{7,14}$/.test(normalized)) {
            formData.append(`from_phone_numbers[${idx}]`, normalized);
          }
        });
      }

      if (params.webhookUrl && /^https?:\/\//.test(params.webhookUrl)) {
        formData.append("webhook_url", params.webhookUrl);
      }

      const response = await fetch(`${this.baseUrl}/batches`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          batch_id: "",
          state: "failed",
          error: `Bolna batch creation failed (HTTP ${response.status}): ${errText.slice(0, 240)}`,
        };
      }

      const data = await response.json();
      const batchId = data.batch_id || data.id || "";
      return {
        success: Boolean(batchId),
        batch_id: batchId,
        state: data.state || data.status || "created",
        simulated: false,
        ...data,
      };
    } catch (err: any) {
      return {
        success: false,
        batch_id: "",
        state: "failed",
        error: `Bolna batch sync network error: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * 12. Schedule / Launch a Batch Campaign (`POST /batches/{batch_id}/schedule`)
   * Official Bolna API requires `multipart/form-data` with ISO 8601 numeric offset (`+00:00`, never `Z`).
   */
  async scheduleBatchCampaign(
    batchId: string,
    scheduledAt?: string | Date,
    bypassCallGuardrails = false
  ): Promise<{
    success: boolean;
    status: string;
    batch_id: string;
    error?: string;
    [key: string]: any;
  }> {
    if (this.isMockMode) {
      return {
        success: false,
        status: "failed",
        batch_id: batchId,
        error: "BOLNA_API_KEY is not configured.",
      };
    }

    if (!batchId || batchId.startsWith("batch_sim_") || batchId.startsWith("batch_local_")) {
      return {
        success: false,
        status: "failed",
        batch_id: batchId,
        error: "Campaign does not have a valid Bolna batch ID.",
      };
    }

    try {
      const formData = new FormData();
      formData.append("scheduled_at", formatBolnaScheduledAt(scheduledAt));
      formData.append("bypass_call_guardrails", String(bypassCallGuardrails));

      const response = await fetch(
        `${this.baseUrl}/batches/${encodeURIComponent(batchId)}/schedule`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          status: "failed",
          batch_id: batchId,
          error: `Bolna schedule batch failed (HTTP ${response.status}): ${errText.slice(0, 240)}`,
        };
      }

      const data = await response.json().catch(() => ({}));
      return {
        success: true,
        status: data.state || data.status || "scheduled",
        batch_id: batchId,
        ...data,
      };
    } catch (err: any) {
      return {
        success: false,
        status: "failed",
        batch_id: batchId,
        error: `Bolna schedule batch error: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * 13. Stop / Pause a Batch Campaign (`POST /batches/{batch_id}/stop`)
   */
  async stopBatchCampaign(
    batchId: string
  ): Promise<{ success: boolean; status: string; batch_id: string; error?: string }> {
    if (this.isMockMode) {
      return {
        success: false,
        status: "failed",
        batch_id: batchId,
        error: "BOLNA_API_KEY is not configured.",
      };
    }

    if (!batchId || batchId.startsWith("batch_sim_") || batchId.startsWith("batch_local_")) {
      return {
        success: false,
        status: "failed",
        batch_id: batchId,
        error: "Campaign does not have a valid Bolna batch ID.",
      };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/batches/${encodeURIComponent(batchId)}/stop`,
        {
          method: "POST",
          headers: this.getHeaders(),
        }
      );
      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          status: "failed",
          batch_id: batchId,
          error: `Bolna stop batch failed (HTTP ${response.status}): ${errText.slice(0, 240)}`,
        };
      }
      return { success: true, status: "stopped", batch_id: batchId };
    } catch (err: any) {
      return {
        success: false,
        status: "failed",
        batch_id: batchId,
        error: `Bolna stop batch error: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * 13b. Delete a Batch Campaign (`DELETE /batches/{batch_id}`)
   */
  async deleteBatchCampaign(
    batchId: string
  ): Promise<{ success: boolean; batch_id: string; error?: string }> {
    if (this.isMockMode || !batchId || batchId.startsWith("batch_sim_") || batchId.startsWith("batch_local_")) {
      return { success: true, batch_id: batchId };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/batches/${encodeURIComponent(batchId)}`,
        {
          method: "DELETE",
          headers: this.getHeaders(),
        }
      );
      if (response.ok || response.status === 404) {
        return { success: true, batch_id: batchId };
      }
      const errText = await response.text();
      return {
        success: false,
        batch_id: batchId,
        error: `Bolna delete batch failed (HTTP ${response.status}): ${errText.slice(0, 240)}`,
      };
    } catch (err: any) {
      return {
        success: false,
        batch_id: batchId,
        error: `Bolna delete batch error: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * 14. Get Batch Details (`GET /batches/{batch_id}`) & List Agent Batches (`GET /batches/{agent_id}/all`)
   */
  async getBatchDetails(batchId: string): Promise<Record<string, any>> {
    if (
      this.isMockMode ||
      !batchId ||
      batchId.startsWith("batch_sim_") ||
      batchId.startsWith("batch_local_")
    ) {
      return { batch_id: batchId, state: "unlinked" };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/batches/${encodeURIComponent(batchId)}`,
        {
          method: "GET",
          headers: this.getHeaders(),
          cache: "no-store",
        }
      );
      if (response.ok) {
        return await response.json();
      }
      const errText = await response.text();
      return {
        batch_id: batchId,
        state: "error",
        error: `HTTP ${response.status}: ${errText.slice(0, 200)}`,
      };
    } catch (err: any) {
      return { batch_id: batchId, state: "error", error: err?.message };
    }
  }

  async listAgentBatches(bolnaAgentId: string): Promise<any[]> {
    if (this.isMockMode || !bolnaAgentId || bolnaAgentId.startsWith("bolna_sim_")) {
      return [];
    }
    try {
      const res = await fetch(
        `${this.baseUrl}/batches/${encodeURIComponent(bolnaAgentId)}/all`,
        {
          method: "GET",
          headers: this.getHeaders(),
          cache: "no-store",
        }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    } catch {
      return [];
    }
  }

  async getBatchExecutions(batchId: string): Promise<any[]> {
    if (this.isMockMode || !batchId || batchId.startsWith("batch_sim_")) {
      return [];
    }
    try {
      const res = await fetch(
        `${this.baseUrl}/v2/batches/${encodeURIComponent(batchId)}/executions`,
        {
          method: "GET",
          headers: this.getHeaders(),
          cache: "no-store",
        }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    } catch {
      return [];
    }
  }

  /**
   * 15. List all Knowledge Bases on Bolna (`GET /knowledgebase/all`)
   */
  async listKnowledgeBases(): Promise<any[]> {
    if (this.isMockMode) return [];
    try {
      const res = await fetch(`${this.baseUrl}/knowledgebase/all`, {
        headers: this.getHeaders(),
        cache: "no-store",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    } catch {
      return [];
    }
  }

  /**
   * 15b. Get Knowledge Base status & metadata (`GET /knowledgebase/{rag_id}`)
   */
  async getKnowledgeBase(
    ragId: string
  ): Promise<{ success: boolean; data?: Record<string, any>; error?: string }> {
    if (this.isMockMode || !ragId || ragId.startsWith("rag_sim_")) {
      return { success: false, error: "Invalid or unlinked Bolna Knowledge Base ID." };
    }
    try {
      const res = await fetch(
        `${this.baseUrl}/knowledgebase/${encodeURIComponent(ragId)}`,
        {
          method: "GET",
          headers: this.getHeaders(),
          cache: "no-store",
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: `Bolna getKnowledgeBase failed (HTTP ${res.status}): ${errText.slice(0, 200)}`,
        };
      }
      return { success: true, data: await res.json() };
    } catch (err: any) {
      return {
        success: false,
        error: `Bolna getKnowledgeBase error: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * 16. Create / Ingest a Knowledge Base on Bolna (`POST /knowledgebase`)
   * Supports URL ingestion or file upload (PDF/TXT/DOCX/CSV) with explicit error surfacing.
   */
  async createKnowledgeBase(params: {
    url?: string;
    fileContent?: Buffer;
    fileName?: string;
    multilingual?: boolean;
  }): Promise<{
    success: boolean;
    rag_id?: string;
    status?: string;
    file_name?: string;
    error?: string;
  }> {
    if (this.isMockMode) {
      return {
        success: false,
        error:
          "BOLNA_API_KEY is not configured. Configure a valid Bolna API key to sync Knowledge Bases.",
      };
    }

    try {
      const formData = new FormData();
      if (params.url) {
        formData.append("url", params.url);
      } else if (params.fileContent) {
        const blob = new Blob([new Uint8Array(params.fileContent)]);
        formData.append("file", blob, params.fileName || "document.pdf");
      } else {
        return {
          success: false,
          error: "Either a source URL or a document file is required for Bolna Knowledge Base sync.",
        };
      }

      if (params.multilingual) {
        formData.append("multilingual", "true");
      }

      const res = await fetch(`${this.baseUrl}/knowledgebase`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          error: `Bolna Knowledge Base upload failed (HTTP ${res.status}): ${text.slice(0, 240)}`,
        };
      }

      const data = await res.json();
      const ragId = data.rag_id || data.id;
      return {
        success: Boolean(ragId),
        rag_id: ragId,
        status: data.status || "processing",
        file_name: data.file_name || params.fileName,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Bolna Knowledge Base sync error: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * 17. Delete a Knowledge Base on Bolna (`DELETE /knowledgebase/{rag_id}`)
   */
  async deleteKnowledgeBase(
    ragId: string
  ): Promise<{ success: boolean; rag_id: string; error?: string }> {
    if (this.isMockMode || !ragId || ragId.startsWith("rag_sim_")) {
      return { success: true, rag_id: ragId };
    }
    try {
      const res = await fetch(
        `${this.baseUrl}/knowledgebase/${encodeURIComponent(ragId)}`,
        {
          method: "DELETE",
          headers: this.getHeaders(),
        }
      );
      if (res.ok || res.status === 404) {
        return { success: true, rag_id: ragId };
      }
      const errText = await res.text();
      return {
        success: false,
        rag_id: ragId,
        error: `Bolna delete Knowledge Base failed (HTTP ${res.status}): ${errText.slice(0, 240)}`,
      };
    } catch (err: any) {
      return {
        success: false,
        rag_id: ragId,
        error: `Bolna delete Knowledge Base error: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * 18. Attach Knowledge Base RAG IDs to an existing Bolna Agent (`PATCH /v2/agent/{agent_id}`)
   */
  async attachKnowledgeBasesToAgent(
    bolnaAgentId: string,
    ragIds: string[]
  ): Promise<{ success: boolean; agent_id: string; ragIds: string[]; error?: string }> {
    if (this.isMockMode) {
      return {
        success: false,
        agent_id: bolnaAgentId,
        ragIds,
        error: "BOLNA_API_KEY is not configured.",
      };
    }
    if (!bolnaAgentId || bolnaAgentId.startsWith("bolna_sim_")) {
      return {
        success: false,
        agent_id: bolnaAgentId,
        ragIds,
        error: "Agent is not synced to Bolna yet.",
      };
    }

    const validRagIds = ragIds.filter((id) => Boolean(id) && !id.startsWith("rag_sim_"));

    try {
      const patchPayload = {
        agent_config: {
          tasks: [
            {
              task_type: "conversation",
              tools_config: {
                llm_agent: {
                  agent_type: validRagIds.length > 0 ? "knowledgebase_agent" : "simple_llm_agent",
                  llm_config: {
                    vector_store:
                      validRagIds.length > 0
                        ? {
                            provider: "lancedb",
                            provider_config: {
                              vector_id: validRagIds,
                            },
                          }
                        : null,
                  },
                },
              },
            },
          ],
        },
      };

      const res = await fetch(
        `${this.baseUrl}/v2/agent/${encodeURIComponent(bolnaAgentId)}`,
        {
          method: "PATCH",
          headers: this.getHeaders(),
          body: JSON.stringify(patchPayload),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          agent_id: bolnaAgentId,
          ragIds: validRagIds,
          error: `Bolna agent KB attachment failed (HTTP ${res.status}): ${errText.slice(0, 240)}`,
        };
      }

      return { success: true, agent_id: bolnaAgentId, ragIds: validRagIds };
    } catch (err: any) {
      return {
        success: false,
        agent_id: bolnaAgentId,
        ragIds: validRagIds,
        error: `Bolna agent KB attachment error: ${err?.message || "Unknown error"}`,
      };
    }
  }

  /**
   * 19. List Purchased / Active Phone Numbers & Trunks (`GET /phone-numbers/all`)
   */
  async listPhoneNumbers(): Promise<
    Array<{
      id: string;
      phone_number: string;
      telephony_provider?: string;
      agent_id?: string | null;
      rented?: boolean;
      friendly_name?: string;
    }>
  > {
    if (this.isMockMode) return [];
    try {
      const res = await fetch(`${this.baseUrl}/phone-numbers/all`, {
        method: "GET",
        headers: this.getHeaders(),
        cache: "no-store",
      });
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.phone_numbers)
        ? data.phone_numbers
        : [];
      return list
        .filter((item: any) => Boolean(item?.phone_number))
        .map((item: any) => ({
          id: String(item.id || item.phone_number),
          phone_number: String(item.phone_number),
          telephony_provider: item.telephony_provider || item.provider || "bolna",
          agent_id: item.agent_id || null,
          rented: Boolean(item.rented ?? true),
          friendly_name: item.friendly_name || undefined,
        }));
    } catch {
      return [];
    }
  }

  /**
   * 10. Validate Webhook Signature / Secret
   */
  validateWebhookSignature(headerSecret: string | null): boolean {
    const secret = process.env.BOLNA_WEBHOOK_SECRET || "";
    if (!secret) {
      return process.env.NODE_ENV !== "production";
    }
    if (!headerSecret) return false;
    const cleaned = headerSecret.replace(/^Bearer\s+/i, "").trim();
    return cleaned === secret;
  }
}

export const bolnaService = new BolnaService();
