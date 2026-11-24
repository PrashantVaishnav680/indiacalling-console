"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { IAgentExtractionField, IKnowledgeBase } from "@/types";
import { getVisibleCuratedVoices } from "@/lib/voice-registry";
import { LoadingSpinner, LoadingState, ButtonSpinner } from "@/components/LoadingSpinner";

type StudioTab =
  | "agent"
  | "intelligence"
  | "languages"
  | "calling"
  | "engine"
  | "tools"
  | "extractions";

const INDUSTRY_OPTIONS = [
  "Real Estate",
  "Healthcare",
  "Education",
  "Banking & Finance",
  "Insurance",
  "E-commerce",
  "Hospitality",
  "Automotive",
  "IT & Software",
  "Telecommunications",
  "Other",
];

const BUSINESS_OBJECTIVE_OPTIONS = [
  "Lead Generation",
  "Lead Qualification",
  "Appointment Booking",
  "Sales & Conversion",
  "Customer Support",
  "Customer Follow-up",
  "Payment Reminder",
  "Survey & Feedback",
  "Custom",
];

const AGENT_PERSONALITY_OPTIONS = [
  "Professional & Formal",
  "Professional & Friendly",
  "Warm & Consultative",
  "Persuasive & Sales-oriented",
  "Empathetic & Supportive",
  "Casual & Conversational",
  "Custom",
];

const BOLNA_SUPPORTED_LLM_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
  azure: ["gpt-4.1-mini cluster", "gpt-4o-mini", "gpt-4o"],
  anthropic: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  deepseek: ["deepseek-chat"],
};

const BOLNA_SUPPORTED_LANGUAGES = [
  { label: "English + Hindi", code: "en", note: "Bilingual Hinglish" },
  { label: "Hindi", code: "hi", note: "हिंदी (Devanagari / Spoken Hindi)" },
  { label: "English", code: "en", note: "Indian English" },
  { label: "Gujarati", code: "gu", note: "ગુજરાતી" },
  { label: "Marathi", code: "mr", note: "मराठी" },
  { label: "Tamil", code: "ta", note: "தமிழ்" },
  { label: "Telugu", code: "te", note: "తెలుగు" },
  { label: "Bengali", code: "bn", note: "বাংলা" },
];

const BOLNA_VOICE_MODELS_BY_PROVIDER: Record<string, string[]> = {
  elevenlabs: ["eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_v3_conversational", "eleven_v4_turbo"],
  sarvam: ["bulbul:v3", "bulbul:v4-flash"],
  deepgram: ["aura-2"],
  polly: ["neural", "standard"],
  cartesia: ["sonic-3.6", "sonic-3"],
};

const BOLNA_VOICE_OPTIONS = [
  {
    id: "1Z7Y8o9cvUeWq8oLKgMY",
    name: "Tripti - Calm and Clear",
    provider: "elevenlabs",
    models: ["eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_v3_conversational", "eleven_v4_turbo"],
    languages: ["English", "Hindi", "English + Hindi"],
    desc: "Verified Indian English & Hindi female voice",
  },
  {
    id: "90ipbRoKi4CpHXvKVtl0",
    name: "Anika - Customer Care Agent",
    provider: "elevenlabs",
    models: ["eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_v3_conversational", "eleven_v4_turbo"],
    languages: ["English", "Hindi", "English + Hindi"],
    desc: "Official IndiaCalling Voice AI ElevenLabs Indian female voice",
  },
  {
    id: "pzxut4zZz4GImZNlqQ3H",
    name: "Raju - Natural Conversationalist",
    provider: "elevenlabs",
    models: ["eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_v3_conversational", "eleven_v4_turbo"],
    languages: ["English", "Hindi", "English + Hindi"],
    desc: "Official IndiaCalling Voice AI ElevenLabs Indian male voice",
  },
  {
    id: "priya",
    name: "Priya",
    provider: "sarvam",
    models: ["bulbul:v3"],
    languages: [
      "Hindi",
      "English + Hindi",
      "English",
      "Gujarati",
      "Marathi",
      "Tamil",
      "Telugu",
      "Bengali",
    ],
    desc: "Official Sarvam Bulbul v3 voice supporting all 11 Indian languages",
  },
  {
    id: "IkSv4tkouLJ6kYsQA7XD",
    name: "Angelica",
    provider: "elevenlabs",
    models: ["eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_v3_conversational", "eleven_v4_turbo"],
    languages: ["English"],
    desc: "Official IndiaCalling Voice AI ElevenLabs global English female voice",
  },
  {
    id: "z9bdYNSNQZi0g3cHsgzF",
    name: "John",
    provider: "elevenlabs",
    models: ["eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_v3_conversational", "eleven_v4_turbo"],
    languages: ["English"],
    desc: "Official IndiaCalling Voice AI ElevenLabs global English male voice",
  },
];

const SUGGESTED_EXTRACTION_PRESETS: IAgentExtractionField[] = [
  {
    key: "customer_name",
    label: "Customer Name",
    type: "string",
    description: "Full name of the prospect or caller",
    required: true,
  },
  {
    key: "phone_number",
    label: "Phone Number",
    type: "string",
    description: "Verified contact number",
    required: true,
  },
  {
    key: "email",
    label: "Email",
    type: "string",
    description: "Customer email address if shared",
    required: false,
  },
  {
    key: "budget",
    label: "Budget",
    type: "string",
    description: "Stated budget range or price expectation",
    required: true,
  },
  {
    key: "location",
    label: "Location",
    type: "string",
    description: "Caller city, locality, or service region",
    required: false,
  },
  {
    key: "product_interest",
    label: "Product Interest",
    type: "string",
    description: "Specific product, plan, or service inquired about",
    required: false,
  },
  {
    key: "preferred_timeline",
    label: "Preferred Timeline",
    type: "string",
    description: "Expected purchase or implementation timeline",
    required: true,
  },
  {
    key: "appointment_preference",
    label: "Appointment Preference",
    type: "string",
    description: "Preferred callback, demo, or site visit date/time",
    required: false,
  },
  {
    key: "qualification_status",
    label: "Qualification Status",
    type: "enum",
    description: "qualified, unqualified, or follow_up",
    required: true,
  },
];

const SUPPORTED_INTEGRATION_OPTIONS = [
  {
    id: "crm_sync",
    label: "CRM Lead Sync",
    desc: "Automatically push post-call qualification results to CRM",
  },
  {
    id: "calendar_booking",
    label: "Calendar Appointment Booking",
    desc: "Check availability and book callback/demo slots during the call",
  },
  {
    id: "webhook_dispatch",
    label: "Real-Time Event Webhooks",
    desc: "Send JSON execution payloads to your external webhook URL",
  },
  {
    id: "human_handoff",
    label: "Live Human Call Transfer / Handoff",
    desc: "Warm-transfer high-intent callers to a human sales representative",
  },
];

export default function AgentStudioSevenTabPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editAgentId = searchParams.get("edit");
  const isEditMode = Boolean(editAgentId);

  const [activeTab, setActiveTab] = useState<StudioTab>("agent");
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(editAgentId));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState("");
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<IKnowledgeBase[]>([]);
  const [loadingKbs, setLoadingKbs] = useState(true);

  // Search filters for long/searchable dropdowns
  const [industrySearch, setIndustrySearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [kbSearch, setKbSearch] = useState("");
  const [voiceSearch, setVoiceSearch] = useState("");
  const [integrationSearch, setIntegrationSearch] = useState("");
  const [showAdvancedWebhooks, setShowAdvancedWebhooks] = useState(false);
  const [selectedWebhookEvents, setSelectedWebhookEvents] = useState<string[]>([
    "call_started",
    "call_completed",
    "lead_qualified",
    "call_failed",
  ]);
  const [transferCondition, setTransferCondition] = useState(
    "High-intent caller or requested transfer to human agent"
  );

  const [existingBolnaId, setExistingBolnaId] = useState<string>("");
  const [existingSyncStatus, setExistingSyncStatus] =
    useState<string>("pending");
  const [configVersion, setConfigVersion] = useState<number>(1);
  const [versionHistory, setVersionHistory] = useState<any[]>([]);

  // AI Prompt Assistant – Gemini Modal State (Part 5)
  const [showPromptAssistant, setShowPromptAssistant] = useState(false);
  const [geminiRunning, setGeminiRunning] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(true);
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
  const [promptAction, setPromptAction] = useState("generate_new_prompt");
  const [promptLanguage, setPromptLanguage] = useState("English");
  const [promptStyle, setPromptStyle] = useState("Consultative Sales");
  const [copiedGenerated, setCopiedGenerated] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [geminiSetupSteps, setGeminiSetupSteps] = useState<string[]>([]);
  const [confirmApplyModal, setConfirmApplyModal] = useState(false);

  // 13 Prefilled Gemini Assistant Inputs (Part 5.4)
  const [assistantInputs, setAssistantInputs] = useState({
    agentName: "",
    industry: "Real Estate",
    businessObjective: "Lead Qualification",
    agentPersonality: "Professional & Friendly",
    businessDescription: "",
    targetAudience: "Decision makers and inbound/outbound prospects",
    primaryLanguage: "English + Hindi",
    supportedLanguages: ["Hindi", "English"],
    conversationGoals:
      "Greet caller politely, verify requirements, qualify budget and timeline, and schedule next steps.",
    requiredQuestions:
      "1. What specific requirement are you looking for?\n2. What is your approximate budget?\n3. What is your timeline?",
    qualificationCriteria:
      "Caller has a verified need, realistic budget, and timeline within 90 days.",
    objectionHandlingRequirements:
      "Politely handle 'I am busy right now', 'Send details on WhatsApp', and 'Budget is tight'.",
    desiredConversationStyle:
      "Natural spoken turns under 2 sentences, warm tone, never interrupt.",
  });

  // 7 Generated Sections Preview State (Part 5.5)
  const [generatedSections, setGeneratedSections] = useState({
    systemPrompt: "",
    greetingMessage: "",
    conversationInstructions: "",
    fallbackResponses: "",
    qualificationQuestions: "",
    objectionHandling: "",
    conversationClosing: "",
  });

  // Custom Extraction Field Input State
  const [newExtractionKey, setNewExtractionKey] = useState("");
  const [newExtractionLabel, setNewExtractionLabel] = useState("");
  const [newExtractionType, setNewExtractionType] = useState<
    "string" | "number" | "boolean" | "enum"
  >("string");
  const [newExtractionRequired, setNewExtractionRequired] = useState(false);
  const [newExtractionDesc, setNewExtractionDesc] = useState("");
  const [pronunciations, setPronunciations] = useState<Array<{ word: string; pronounceAs: string }>>([
    { word: "HDFC", pronounceAs: "H D F C" },
  ]);
  const [newPronWord, setNewPronWord] = useState("");
  const [newPronAs, setNewPronAs] = useState("");
  const [showBulkPronImport, setShowBulkPronImport] = useState(false);
  const [bulkPronText, setBulkPronText] = useState("");
  const [bulkPronFeedback, setBulkPronFeedback] = useState<string | null>(null);
  const [showSamplingRateTip, setShowSamplingRateTip] = useState(false);
  const [transcriptionKeywords, setTranscriptionKeywords] = useState("");
  const [transcriptionContext, setTranscriptionContext] = useState("");
  const [incrementalDelayMs, setIncrementalDelayMs] = useState(400);
  const [checkUserOnline, setCheckUserOnline] = useState(true);
  const [userOnlineTriggerSec, setUserOnlineTriggerSec] = useState(10);
  const [finalCallMessage, setFinalCallMessage] = useState(
    "Thank you for your time today. Have a wonderful day ahead!"
  );
  const [extractionHelperLoading, setExtractionHelperLoading] = useState(false);

  // Custom API Tool Input State
  const [newToolName, setNewToolName] = useState("");
  const [newToolEndpoint, setNewToolEndpoint] = useState("");
  const [newToolDesc, setNewToolDesc] = useState("");

  const [formData, setFormData] = useState({
    // TAB 1 — AGENT IDENTITY, BUSINESS CONTEXT & MASTER SYSTEM PROMPT
    organizationId: "org_default_01",
    name: "",
    businessName: "",
    industry: "Real Estate",
    customIndustry: "",
    businessObjective: "Lead Qualification",
    customBusinessObjective: "",
    description: "",
    personality: "Professional & Friendly",
    customPersonality: "",
    greetingMessage:
      "Hello! Am I speaking with {lead_name}? This is calling from {company_name}.",
    systemPrompt:
      "You are an AI voice specialist calling on behalf of our organization. Greet the caller politely, verify their requirement, budget, and timeline, and offer to schedule a follow-up with a specialist.",
    conversationInstructions:
      "Keep every response under 2 short sentences. Pause to let the customer speak and never interrupt.",
    fallbackMessage:
      "I apologize, I didn't catch that clearly. Could you please repeat that?",

    // TAB 2 — INTELLIGENCE, LLM PARAMETERS & KNOWLEDGE BASE
    llmProvider: "openai",
    llmModel: "gpt-4o-mini",
    maxTokens: 250,
    temperature: 0.2,
    knowledgeBaseIds: [] as string[],
    conversationContext:
      "Caller has either submitted an inquiry or is part of an opted-in outreach campaign.",
    advancedInstructions:
      "Always verify budget and timeline before marking a lead as qualified. Never invent pricing not present in the Knowledge Base.",

    // TAB 3 — LANGUAGES
    language: "English + Hindi",
    additionalLanguages: ["Hindi", "English"] as string[],
    multilingualEnabled: true,
    languageDetectionEnabled: true,
    defaultLanguage: "English + Hindi",
    languageInstructions:
      "Switch seamlessly between English and Hindi (Hinglish) based on the caller's spoken language.",

    // TAB 4 — CALLING CONFIGURATION
    agentType: "outbound" as "outbound" | "inbound" | "both",
    telephonyProvider: "plivo",
    phoneNumber: "",
    scheduleTimezone: "Asia/Kolkata",
    allowedDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as string[],
    callingStartHour: "09:30",
    callingEndHour: "18:30",
    maxRetries: 2,
    retryIntervalMinutes: 60,
    maxDurationSeconds: 300,
    callTimeoutSeconds: 30,
    hangupAfterSilenceSeconds: 12,
    aiHangupEnabled: true,
    interruptionWords: 2,
    greetingBehavior: "agent_speaks_first" as
      | "agent_speaks_first"
      | "wait_for_user",
    endCallBehavior:
      "Thank the caller politely and disconnect after confirming next steps.",

    // TAB 5 — VOICE & ENGINE CONFIGURATION
    voiceEngine: "Cascaded" as const,
    transcriberProvider: "deepgram",
    transcriberModel: "nova-2",
    samplingRate: 16000,
    endpointingMs: 250,
    voiceProvider: "elevenlabs",
    voiceModel: "eleven_turbo_v2_5",
    voiceId: "1Z7Y8o9cvUeWq8oLKgMY",
    voiceName: "Tripti - Calm and Clear",
    voiceLanguage: "English + Hindi",
    speed: 1.0,
    stability: 0.75,
    bufferSize: 250,

    // TAB 6 — TOOLS & INTEGRATIONS
    enabledIntegrations: ["webhook_dispatch"] as string[],
    crmProvider: "none",
    calendarProvider: "none",
    customVariables: ["{lead_name}", "{company_name}", "{city}"],
    webhookUrl: "",
    webhookSecret: "",
    appointmentToolEnabled: false,
    appointmentWebhookUrl: "",
    callTransferEnabled: false,
    warmTransferNumber: "",
    handoffDepartment: "Sales Desk",
    customApiTools: [] as Array<{
      name: string;
      description: string;
      endpoint: string;
      method: "GET" | "POST";
    }>,

    // TAB 7 — EXTRACTIONS & LEAD QUALIFICATION
    closingMessage: "",
    extractionsEnabled: true,
    extractionFields: SUGGESTED_EXTRACTION_PRESETS,
    qualificationCriteriaText:
      "Verify customer need, budget range, and timeline within 90 days.",
    defaultQualificationStatus: "qualified",
    thresholdScore: 70,
    autoAssignSalesperson: true,
    callSummaryEnabled: true,
    status: "active" as "active" | "inactive" | "draft" | "paused",
  });

  const updateField = (updates: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  };

  // Load authenticated user, organizations, real MongoDB Knowledge Bases, and Gemini status
  useEffect(() => {
    async function loadStudioResources() {
      setLoadingKbs(true);
      try {
        const [meRes, orgsRes, kbRes, geminiRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/organizations"),
          fetch("/api/knowledge-base"),
          fetch("/api/ai/prompt-assistant/generate"),
        ]);

        if (meRes.ok) {
          const d = await meRes.json();
          setCurrentUser(d.user);
          if (!isEditMode && d.user?.organizationId) {
            setFormData((prev) => ({
              ...prev,
              organizationId: d.user.organizationId,
              businessName: prev.businessName || d.user.workspaceName || "",
            }));
          }
        }
        if (orgsRes.ok) {
          const d = await orgsRes.json();
          setOrganizations(d.organizations || []);
        }
        if (kbRes.ok) {
          const d = await kbRes.json();
          setKnowledgeBases(d.knowledgeBases || []);
        }
        if (geminiRes.ok) {
          const d = await geminiRes.json();
          setGeminiConfigured(Boolean(d.configured));
          if (d.defaultModel) setGeminiModel(d.defaultModel);
          if (Array.isArray(d.setupInstructions)) {
            setGeminiSetupSteps(d.setupInstructions);
          }
        }
      } catch {
        // Ignore initial resource load errors
      } finally {
        setLoadingKbs(false);
      }
    }
    loadStudioResources();
  }, [isEditMode]);

  // Warn before browser tab unload if unsaved changes exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Load existing agent configuration when editing (Part 6 & Part 10)
  useEffect(() => {
    if (!editAgentId) return;
    let cancelled = false;
    async function loadAgentForEdit() {
      setLoadingExisting(true);
      try {
        const res = await fetch(`/api/agents/${editAgentId}`);
        if (!res.ok) throw new Error("Could not load existing agent.");
        const data = await res.json();
        const a = data.agent;
        if (!a || cancelled) return;

        setExistingBolnaId(a.bolnaAgentId || "");
        setExistingSyncStatus(a.syncStatus || "pending");
        setConfigVersion(a.configVersion || 1);
        setVersionHistory(a.versionHistory || []);

        const savedInd = a.industry || a.category || "Real Estate";
        const isKnownInd = INDUSTRY_OPTIONS.includes(savedInd);

        const savedObj = a.businessObjective || "Lead Qualification";
        const isKnownObj = BUSINESS_OBJECTIVE_OPTIONS.includes(savedObj);

        const savedPers =
          a.conversationConfiguration?.personality ||
          "Professional & Friendly";
        const isKnownPers = AGENT_PERSONALITY_OPTIONS.includes(savedPers);

        setFormData((prev) => ({
          ...prev,
          organizationId: a.organizationId || prev.organizationId,
          name: a.name || "",
          description: a.description || "",
          businessName: a.businessName || "",
          industry: isKnownInd ? savedInd : "Other",
          customIndustry: isKnownInd ? "" : savedInd,
          businessObjective: isKnownObj ? savedObj : "Custom",
          customBusinessObjective: isKnownObj ? "" : savedObj,
          personality: isKnownPers ? savedPers : "Custom",
          customPersonality: isKnownPers ? "" : savedPers,
          agentType: a.agentType || "outbound",
          status: a.status || "active",
          language: a.language || "English + Hindi",
          defaultLanguage:
            a.defaultLanguage || a.language || "English + Hindi",
          additionalLanguages: a.additionalLanguages || ["Hindi", "English"],
          multilingualEnabled: a.multilingualEnabled ?? true,
          languageDetectionEnabled: a.languageDetectionEnabled ?? true,
          languageInstructions: a.languageInstructions || "",
          voiceProvider: a.voiceConfiguration?.provider || "elevenlabs",
          voiceModel: a.voiceConfiguration?.model || "eleven_turbo_v2_5",
          voiceId: a.voiceConfiguration?.voiceId || "1Z7Y8o9cvUeWq8oLKgMY",
          voiceName:
            a.voiceConfiguration?.voiceName || "Tripti - Calm and Clear",
          voiceLanguage:
            a.voiceConfiguration?.language || a.language || "English + Hindi",
          speed: Number(a.voiceConfiguration?.speed || 1.0),
          stability: Number(a.voiceConfiguration?.stability ?? 0.75),
          bufferSize: Number(a.voiceConfiguration?.bufferSize || 250),
          transcriberProvider:
            a.voiceConfiguration?.transcriberProvider || "deepgram",
          transcriberModel: a.voiceConfiguration?.transcriberModel || "nova-2",
          endpointingMs: Number(a.voiceConfiguration?.endpointingMs || 250),
          systemPrompt:
            a.conversationConfiguration?.systemPrompt || prev.systemPrompt,
          greetingMessage:
            a.conversationConfiguration?.greetingMessage ||
            prev.greetingMessage,
          conversationInstructions:
            a.conversationConfiguration?.conversationInstructions ||
            prev.conversationInstructions,
          fallbackMessage:
            a.conversationConfiguration?.fallbackMessage ||
            prev.fallbackMessage,
          conversationContext:
            a.conversationConfiguration?.conversationContext ||
            prev.conversationContext,
          advancedInstructions:
            a.conversationConfiguration?.advancedInstructions ||
            prev.advancedInstructions,
          llmProvider: a.conversationConfiguration?.llmProvider || "openai",
          llmModel: a.conversationConfiguration?.llmModel || "gpt-4o-mini",
          maxTokens: Number(a.conversationConfiguration?.maxTokens || 250),
          temperature: Number(a.conversationConfiguration?.temperature ?? 0.2),
          knowledgeBaseIds:
            a.conversationConfiguration?.knowledgeBaseIds || [],
          telephonyProvider:
            a.callingConfiguration?.telephonyProvider || "plivo",
          phoneNumber: a.callingConfiguration?.phoneNumber || "",
          scheduleTimezone:
            a.callingConfiguration?.scheduleTimezone || "Asia/Kolkata",
          allowedDays: a.callingConfiguration?.allowedDays || [
            "Mon",
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
          ],
          callingStartHour:
            a.callingConfiguration?.allowedCallingHours?.start || "09:30",
          callingEndHour:
            a.callingConfiguration?.allowedCallingHours?.end || "18:30",
          callTimeoutSeconds: Number(
            a.callingConfiguration?.callTimeoutSeconds || 30
          ),
          maxDurationSeconds: Number(
            a.callingConfiguration?.maxDurationSeconds || 300
          ),
          maxRetries: Number(a.callingConfiguration?.maxRetries ?? 2),
          retryIntervalMinutes: Number(
            a.callingConfiguration?.retryIntervalMinutes ?? 60
          ),
          hangupAfterSilenceSeconds: Number(
            a.callingConfiguration?.hangupAfterSilenceSeconds || 12
          ),
          aiHangupEnabled: a.callingConfiguration?.aiHangupEnabled ?? true,
          interruptionWords: Number(
            a.callingConfiguration?.interruptionWords || 2
          ),
          endCallBehavior:
            a.callingConfiguration?.endCallBehavior || prev.endCallBehavior,
          greetingBehavior:
            a.callingConfiguration?.greetingBehavior || "agent_speaks_first",
          enabledIntegrations:
            a.toolsConfiguration?.enabledIntegrations || ["webhook_dispatch"],
          crmProvider: a.toolsConfiguration?.crmProvider || "none",
          calendarProvider: a.toolsConfiguration?.calendarProvider || "none",
          customVariables: a.toolsConfiguration?.customVariables || [
            "{lead_name}",
            "{company_name}",
          ],
          webhookUrl: a.toolsConfiguration?.webhookUrl || "",
          webhookSecret: a.toolsConfiguration?.webhookSecret || "",
          appointmentToolEnabled: Boolean(
            a.toolsConfiguration?.appointmentToolEnabled
          ),
          appointmentWebhookUrl:
            a.toolsConfiguration?.appointmentWebhookUrl || "",
          callTransferEnabled: Boolean(
            a.toolsConfiguration?.callTransferEnabled
          ),
          warmTransferNumber:
            a.toolsConfiguration?.callTransferNumber ||
            a.qualificationConfiguration?.warmTransferNumber ||
            "",
          handoffDepartment:
            a.toolsConfiguration?.handoffDepartment || "Sales Desk",
          customApiTools: a.toolsConfiguration?.customApiTools || [],
          extractionFields:
            a.extractionsConfiguration?.fields?.length > 0
              ? a.extractionsConfiguration.fields
              : SUGGESTED_EXTRACTION_PRESETS,
          qualificationCriteriaText: Array.isArray(
            a.conversationConfiguration?.qualificationCriteria
          )
            ? a.conversationConfiguration.qualificationCriteria.join("\n")
            : prev.qualificationCriteriaText,
          defaultQualificationStatus:
            a.qualificationConfiguration?.defaultQualificationStatus ||
            "qualified",
          thresholdScore: Number(
            a.qualificationConfiguration?.thresholdScore ?? 70
          ),
          autoAssignSalesperson:
            a.qualificationConfiguration?.autoAssignSalesperson ?? true,
        }));
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load agent.");
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    }
    loadAgentForEdit();
    return () => {
      cancelled = true;
    };
  }, [editAgentId]);

  const resolvedIndustry =
    formData.industry === "Other" && formData.customIndustry.trim()
      ? formData.customIndustry.trim()
      : formData.industry;

  const resolvedObjective =
    formData.businessObjective === "Custom" &&
    formData.customBusinessObjective.trim()
      ? formData.customBusinessObjective.trim()
      : formData.businessObjective;

  const resolvedPersonality =
    formData.personality === "Custom" && formData.customPersonality.trim()
      ? formData.customPersonality.trim()
      : formData.personality;

  // Open Gemini Prompt Assistant and prefill with current Agent Studio values (Part 5.4)
  const handleOpenGeminiModal = (forcedLanguage?: string | React.MouseEvent) => {
    const forcedLangStr = typeof forcedLanguage === "string" ? forcedLanguage : undefined;
    const rawLang = String(formData.language || "English + Hindi").trim();
    const cleanPrimaryLang =
      rawLang.replace(/\s*\([^)]*\)\s*$/g, "").trim() || "English + Hindi";

    const cleanSupportedLangs = (
      Array.isArray(formData.additionalLanguages) &&
      formData.additionalLanguages.length > 0
        ? formData.additionalLanguages
        : ["Hindi", "English"]
    )
      .map((l) => String(l || "").replace(/\s*\([^)]*\)\s*$/g, "").trim())
      .filter(Boolean);

    setAssistantInputs((prev) => ({
      ...prev,
      agentName: formData.name || formData.businessName || "AI Voice Agent",
      industry: resolvedIndustry,
      businessObjective: resolvedObjective,
      agentPersonality: resolvedPersonality,
      businessDescription:
        formData.description || formData.conversationContext || "",
      primaryLanguage: cleanPrimaryLang,
      supportedLanguages: cleanSupportedLangs.length ? cleanSupportedLangs : ["Hindi", "English"],
      qualificationCriteria: formData.qualificationCriteriaText,
    }));
    if (forcedLangStr) {
      setPromptLanguage(forcedLangStr);
    }
    setShowPromptAssistant(true);
  };

  const handleRunGeminiAssistant = async (
    actionOverride?: string,
    targetSectionOverride?: string,
    languageOverride?: string
  ) => {
    setGeminiRunning(true);
    setGeminiError(null);
    const chosenAction = actionOverride || promptAction;
    const chosenLanguage = languageOverride || promptLanguage;
    if (languageOverride) {
      setPromptLanguage(languageOverride);
    }

    try {
      const res = await fetch("/api/ai/prompt-assistant/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: chosenAction,
          targetSection: targetSectionOverride || "all",
          ...assistantInputs,
          promptLanguage: chosenLanguage,
          promptStyle,
          existingPrompt: formData.systemPrompt,
          model: geminiModel,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setGeminiError(
          data.userMessage ||
            data.error ||
            "AI assistant unavailable. Please try again later."
        );
        if (Array.isArray(data.setupInstructions)) {
          setGeminiSetupSteps(data.setupInstructions);
        }
        return;
      }

      if (data.sections) {
        setGeneratedSections((prev) => {
          if (targetSectionOverride && targetSectionOverride !== "all") {
            return {
              ...prev,
              [targetSectionOverride]:
                data.sections[targetSectionOverride] ||
                prev[targetSectionOverride as keyof typeof prev],
            };
          }
          return {
            systemPrompt:
              data.sections.systemPrompt || data.generatedPrompt || "",
            greetingMessage: data.sections.greetingMessage || "",
            conversationInstructions:
              data.sections.conversationInstructions || "",
            fallbackResponses: data.sections.fallbackResponses || "",
            qualificationQuestions: data.sections.qualificationQuestions || "",
            objectionHandling: data.sections.objectionHandling || "",
            conversationClosing: data.sections.conversationClosing || "",
          };
        });
      } else if (data.generatedPrompt) {
        setGeneratedSections((prev) => ({
          ...prev,
          systemPrompt: data.generatedPrompt,
        }));
      }
    } catch (err: any) {
      setGeminiError(
        err?.message || "Could not connect to AI Prompt Assistant – Gemini."
      );
    } finally {
      setGeminiRunning(false);
    }
  };

  const handleConfirmApplyGeneratedToStudio = () => {
    const combinedPrompt = [
      generatedSections.systemPrompt,
      generatedSections.qualificationQuestions
        ? `\nQualification Questions:\n${generatedSections.qualificationQuestions}`
        : "",
      generatedSections.objectionHandling
        ? `\nObjection Handling:\n${generatedSections.objectionHandling}`
        : "",
      generatedSections.conversationClosing
        ? `\nConversation Closing:\n${generatedSections.conversationClosing}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    updateField({
      systemPrompt: combinedPrompt || formData.systemPrompt,
      greetingMessage:
        generatedSections.greetingMessage || formData.greetingMessage,
      conversationInstructions:
        generatedSections.conversationInstructions ||
        formData.conversationInstructions,
      fallbackMessage:
        generatedSections.fallbackResponses || formData.fallbackMessage,
    });
    setConfirmApplyModal(false);
    setShowPromptAssistant(false);
  };

  const formatTransferPhoneE164 = (raw: string): string => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return "";
    if (trimmed.toLowerCase().startsWith("sip:")) return trimmed;
    const digits = trimmed.replace(/[^\d]/g, "");
    if (!digits) return trimmed;
    if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
      return `+${digits}`;
    }
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return `+${digits}`;
  };

  const mergeBulkPronunciations = (rawText: string) => {
    const incoming: Array<{ word: string; pronounceAs: string }> = [];
    const trimmed = rawText.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const w = String(item?.word || item?.term || "").trim();
            const pa = String(item?.pronounceAs || item?.pronunciation || "").trim();
            if (w && pa) incoming.push({ word: w, pronounceAs: pa });
          }
        } else if (parsed && typeof parsed === "object") {
          for (const [k, v] of Object.entries(parsed)) {
            if (k.trim() && String(v || "").trim()) {
              incoming.push({ word: k.trim(), pronounceAs: String(v).trim() });
            }
          }
        }
      } catch {
        setBulkPronFeedback("Invalid JSON format. Use Word -> Pronunciation lines or valid JSON.");
        return;
      }
    } else {
      const lines = trimmed.split(/\r?\n/);
      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine) continue;
        const parts = cleanLine.includes("->")
          ? cleanLine.split("->")
          : cleanLine.includes("=>")
          ? cleanLine.split("=>")
          : cleanLine.includes("=")
          ? cleanLine.split("=")
          : cleanLine.split(",");
        if (parts.length >= 2) {
          const w = parts[0].replace(/^["']|["']$/g, "").trim();
          const pa = parts.slice(1).join(",").replace(/^["']|["']$/g, "").trim();
          if (w && pa && !(w.toLowerCase() === "word" && pa.toLowerCase().includes("pronounc"))) {
            incoming.push({ word: w, pronounceAs: pa });
          }
        }
      }
    }
    if (incoming.length === 0) {
      setBulkPronFeedback("No valid entries found. Format each line as: HDFC -> H D F C");
      return;
    }
    setPronunciations((prev) => {
      const map = new Map(prev.map((x) => [x.word.toLowerCase(), x]));
      for (const entry of incoming) {
        map.set(entry.word.toLowerCase(), entry);
      }
      return Array.from(map.values());
    });
    setBulkPronText("");
    setBulkPronFeedback(`Imported ${incoming.length} pronunciation ${incoming.length === 1 ? "entry" : "entries"}.`);
  };

  const buildLiveSampleExtractionJson = () => {
    const sample: Record<string, any> = {};
    const fields = formData.extractionFields || [];
    if (fields.length === 0) {
      return JSON.stringify(
        { note: "Add extraction fields above to preview live JSON output" },
        null,
        2
      );
    }
    for (const f of fields) {
      const k = (f.key || "field").trim();
      const kl = k.toLowerCase();
      if (f.type === "boolean") {
        sample[k] = true;
      } else if (f.type === "number") {
        sample[k] = kl.includes("score") ? 85 : kl.includes("budget") ? 750000 : 1;
      } else if (f.type === "enum" || kl.includes("status") || kl.includes("intent")) {
        sample[k] = "HOT";
      } else if (kl.includes("name")) {
        sample[k] = "Rohan Verma";
      } else if (kl.includes("budget") || kl.includes("fee") || kl.includes("price")) {
        sample[k] = "₹5,00,000 - ₹10,00,000";
      } else if (kl.includes("timeline") || kl.includes("date") || kl.includes("schedule")) {
        sample[k] = "Within 30 days";
      } else if (kl.includes("city") || kl.includes("location")) {
        sample[k] = "Ahmedabad, Gujarat";
      } else if (kl.includes("course") || kl.includes("program") || kl.includes("product")) {
        sample[k] = "Flagship Program";
      } else {
        sample[k] = f.label ? `Sample ${f.label}` : "Captured value";
      }
    }
    return JSON.stringify(sample, null, 2);
  };

  const getRecommendedExtractionSchema = () => {
    const ind = `${formData.industry || ""} ${formData.customIndustry || ""}`.toLowerCase();
    const obj = `${formData.businessObjective || ""} ${formData.customBusinessObjective || ""}`.toLowerCase();
    if (ind.includes("real estate") || ind.includes("property")) {
      return [
        { key: "customer_name", label: "Prospect Full Name", type: "string" as const, description: "Full name stated by the caller", required: true },
        { key: "lead_status", label: "Lead Status (HOT/WARM/COLD)", type: "enum" as const, description: "HOT if ready for site visit, WARM if exploring, COLD if uninterested", required: true },
        { key: "property_configuration", label: "Property Type / BHK", type: "string" as const, description: "Preferred unit type (e.g. 2 BHK, 3 BHK, Villa, Plot)", required: false },
        { key: "budget", label: "Property Budget", type: "string" as const, description: "Stated budget range in INR", required: false },
        { key: "preferred_location", label: "Preferred Micro-Market", type: "string" as const, description: "Preferred locality or corridor", required: false },
        { key: "site_visit_requested", label: "Site Visit Requested", type: "boolean" as const, description: "Whether caller agreed to schedule a site visit", required: false },
      ];
    }
    if (ind.includes("edu") || ind.includes("school") || ind.includes("college") || ind.includes("coaching")) {
      return [
        { key: "student_or_parent_name", label: "Student / Parent Name", type: "string" as const, description: "Name of the student or parent speaking", required: true },
        { key: "lead_status", label: "Admission Interest (HOT/WARM/COLD)", type: "enum" as const, description: "HOT if ready for counseling/campus visit, WARM if researching", required: true },
        { key: "target_program", label: "Target Course / Grade", type: "string" as const, description: "Program, stream, or grade level requested", required: false },
        { key: "intake_timeline", label: "Target Intake / Session", type: "string" as const, description: "Academic session or batch timeframe", required: false },
        { key: "counseling_scheduled", label: "Counseling / Campus Visit Booked", type: "boolean" as const, description: "Whether an admissions counseling slot was confirmed", required: false },
      ];
    }
    if (ind.includes("health") || ind.includes("clinic") || ind.includes("hospital") || ind.includes("medical")) {
      return [
        { key: "patient_name", label: "Patient Name", type: "string" as const, description: "Name of the patient or caller", required: true },
        { key: "department_or_specialty", label: "Specialty / Treatment", type: "string" as const, description: "Department, doctor, or treatment inquired about", required: false },
        { key: "preferred_appointment_slot", label: "Preferred Appointment Slot", type: "string" as const, description: "Requested date and time window", required: false },
        { key: "appointment_confirmed", label: "Appointment Confirmed", type: "boolean" as const, description: "Whether appointment booking was confirmed", required: true },
        { key: "urgency_level", label: "Urgency (HIGH/MEDIUM/LOW)", type: "enum" as const, description: "Clinical or scheduling urgency mentioned", required: false },
      ];
    }
    if (ind.includes("finance") || ind.includes("bfsi") || ind.includes("bank") || ind.includes("insur") || ind.includes("loan")) {
      return [
        { key: "applicant_name", label: "Applicant Name", type: "string" as const, description: "Full name of the applicant", required: true },
        { key: "lead_status", label: "Qualification Status (HOT/WARM/COLD)", type: "enum" as const, description: "Eligibility and purchase intent level", required: true },
        { key: "product_interest", label: "Financial Product", type: "string" as const, description: "Loan type, policy, or investment plan discussed", required: false },
        { key: "loan_or_cover_amount", label: "Requested Amount", type: "string" as const, description: "Target loan, premium, or coverage amount", required: false },
        { key: "callback_requested", label: "Advisor Callback Requested", type: "boolean" as const, description: "Whether caller wants a human relationship manager callback", required: false },
      ];
    }
    if (obj.includes("support") || obj.includes("service")) {
      return [
        { key: "customer_name", label: "Customer Name", type: "string" as const, description: "Full name of the customer", required: true },
        { key: "issue_category", label: "Issue Category", type: "string" as const, description: "Primary support topic or issue type", required: true },
        { key: "resolution_status", label: "Resolution Status (RESOLVED/ESCALATED/FOLLOW_UP)", type: "enum" as const, description: "Whether resolved on call or escalated", required: true },
        { key: "escalation_needed", label: "Human Escalation Needed", type: "boolean" as const, description: "Whether live transfer or ticket escalation is needed", required: false },
      ];
    }
    return [
      { key: "customer_name", label: "Customer Full Name", type: "string" as const, description: "Full name stated by the caller during conversation", required: true },
      { key: "lead_status", label: "Lead Status (HOT/WARM/COLD)", type: "enum" as const, description: "HOT if ready to buy/book demo, WARM if interested, COLD if not interested", required: true },
      { key: "budget", label: "Customer Budget", type: "string" as const, description: "Explicit budget range mentioned by the caller", required: false },
      { key: "timeline", label: "Purchase Timeline", type: "string" as const, description: "Expected decision or purchase timeframe", required: false },
      { key: "next_action", label: "Recommended Next Action", type: "string" as const, description: "Product demo, callback, proposal, or no follow-up", required: false },
    ];
  };

  const validateBeforeSave = (): string | null => {
    if (!formData.name || formData.name.trim().length < 2) {
      setActiveTab("agent");
      return "Agent Name is required (at least 2 characters).";
    }
    if (!formData.systemPrompt || formData.systemPrompt.trim().length < 10) {
      setActiveTab("agent");
      return "System Prompt must be at least 10 characters.";
    }
    if (
      !formData.greetingMessage ||
      formData.greetingMessage.trim().length < 3
    ) {
      setActiveTab("agent");
      return "Agent Greeting Message is required.";
    }
    if (
      formData.enabledIntegrations.includes("webhook_dispatch") &&
      formData.webhookUrl &&
      !formData.webhookUrl.startsWith("http://") &&
      !formData.webhookUrl.startsWith("https://")
    ) {
      setActiveTab("tools");
      return "Webhook URL in Tools & Integrations tab must start with http:// or https://.";
    }
    if (
      formData.callTransferEnabled ||
      formData.enabledIntegrations.includes("human_handoff")
    ) {
      const normalized = formatTransferPhoneE164(formData.warmTransferNumber || "");
      if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
        setActiveTab("tools");
        return "Live Call Transfer destination must be a valid E.164 phone number (e.g. +919829271706).";
      }
      if (normalized !== formData.warmTransferNumber) {
        updateField({ warmTransferNumber: normalized });
      }
    }
    return null;
  };

  const handleSaveAgent = async (options?: {
    asDraft?: boolean;
    launchTestAfter?: boolean;
  }) => {
    const validationErr = validateBeforeSave();
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setLoading(true);
    setError("");
    setSyncNotice(null);

    try {
      const endpoint = isEditMode
        ? `/api/agents/${editAgentId}`
        : "/api/agents";
      const method = isEditMode ? "PUT" : "POST";

      const payload = {
        ...formData,
        industry: resolvedIndustry,
        businessObjective: resolvedObjective,
        personality: resolvedPersonality,
        qualificationCriteria: formData.qualificationCriteriaText
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
        status: options?.asDraft ? "draft" : formData.status || "active",
        skipBolnaSync: Boolean(options?.asDraft),
      };

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || "Failed to save agent");
      }

      setHasUnsavedChanges(false);
      const savedId = data.agent?._id || editAgentId;

      if (options?.launchTestAfter && savedId) {
        router.push(`/testing?agentId=${savedId}`);
        return;
      }

      if (options?.asDraft) {
        setSyncNotice(
          "Draft saved locally in MongoDB without triggering IndiaCalling Voice AI synchronization."
        );
        setTimeout(() => router.push(`/agents/${savedId}`), 1100);
        return;
      }

      if (data.syncStatus !== "synced") {
        setSyncNotice(
          data.syncError ||
            "Agent saved locally (Pending Voice AI Sync). Configure VOICE_AI_API_KEY in .env.local to mark Live Synced."
        );
        setTimeout(() => router.push(`/agents/${savedId}`), 1600);
        return;
      }

      router.push(isEditMode && savedId ? `/agents/${savedId}` : "/agents");
    } catch (err: any) {
      setError(err.message || "Failed to save agent configuration.");
    } finally {
      setLoading(false);
    }
  };

  if (loadingExisting) {
    return (
      <LoadingState
        title="Loading Agent Studio..."
        subtitle="Hydrating 7 configuration tabs, system prompts, voices, and integrations"
      />
    );
  }

  const isSuperAdmin = currentUser?.role === "super_admin";

  // Dependent Dropdown Computations (Part 7)
  const providerModels =
    BOLNA_SUPPORTED_LLM_MODELS[formData.llmProvider] || ["gpt-4o-mini"];
  // Preserve saved model selection even if custom
  const modelsWithSaved = providerModels.includes(formData.llmModel)
    ? providerModels
    : [formData.llmModel, ...providerModels];
  const filteredModels = modelsWithSaved.filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const availableVoiceModels =
    BOLNA_VOICE_MODELS_BY_PROVIDER[formData.voiceProvider] || [
      "eleven_turbo_v2_5",
    ];

  const compatibleVoices = BOLNA_VOICE_OPTIONS.filter((v) => {
    const matchesProvider = v.provider === formData.voiceProvider;
    const matchesLang =
      !formData.voiceLanguage ||
      v.languages.includes(formData.voiceLanguage) ||
      v.languages.includes("English + Hindi");
    const matchesSearch =
      !voiceSearch ||
      v.name.toLowerCase().includes(voiceSearch.toLowerCase()) ||
      v.desc.toLowerCase().includes(voiceSearch.toLowerCase());
    return matchesProvider && matchesLang && matchesSearch;
  });

  // Authorized Knowledge Bases for selected organization
  const authorizedKbs = knowledgeBases.filter((kb) => {
    const matchesOrg =
      isSuperAdmin ||
      String(kb.organizationId) === String(formData.organizationId);
    const matchesSearch =
      !kbSearch ||
      kb.name.toLowerCase().includes(kbSearch.toLowerCase()) ||
      (kb.category || "").toLowerCase().includes(kbSearch.toLowerCase());
    return matchesOrg && matchesSearch;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-24">
      {/* Top Studio Breadcrumb & Version / Sync Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[#747B91]">
          <Link href="/agents" className="hover:text-[#635BFF] font-medium">
            AI Agents
          </Link>
          <span>/</span>
          <span className="font-bold text-[#20243A]">
            {isEditMode
              ? `Edit Agent: ${formData.name || editAgentId}`
              : "Agent Studio — New Agent"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {hasUnsavedChanges && (
            <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
              ● Unsaved Changes
            </span>
          )}
          <span className="px-2.5 py-1 rounded-full bg-[#EEF0FF] border border-[#C7CBFF] text-[#635BFF] font-semibold">
            Version v{configVersion}
          </span>
          {existingBolnaId && (
            <span className="px-2.5 py-1 rounded-full bg-[#F7F8FC] border border-[#E8EAF1] font-mono text-[11px] text-[#20243A]">
              IndiaCalling Voice AI ID: {existingBolnaId}
            </span>
          )}
          <span
            className={`px-2.5 py-1 rounded-full font-semibold border ${
              existingSyncStatus === "synced"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : existingSyncStatus === "failed"
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-gray-100 text-gray-700 border-gray-200"
            }`}
          >
            {existingSyncStatus === "synced"
              ? "Live Synced with Voice AI Engine"
              : existingSyncStatus === "failed"
              ? "Voice AI Sync Failed"
              : "Pending Voice AI Sync"}
          </span>
        </div>
      </div>

      {/* Agent Name & Gemini Prompt Assistant Header Card */}
      <div className="bg-white border border-[#E8EAF1] rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#747B91] mb-1">
              Agent Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => updateField({ name: e.target.value })}
              placeholder="e.g. Healthcare Appointment Specialist or Real Estate Concierge"
              className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-base font-bold text-[#20243A] focus:outline-none focus:border-[#635BFF]"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenGeminiModal()}
              className="px-4 py-2.5 rounded-lg bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF] text-xs font-bold hover:bg-[#635BFF] hover:text-white transition-colors"
            >
              ✨ AI Prompt Assistant – Gemini
            </button>
          </div>
        </div>
      </div>

      {/* 7 Separate Studio Configuration Tabs (Mobile Horizontally Scrollable) */}
      <div className="bg-white border border-[#E8EAF1] rounded-xl p-1.5 overflow-x-auto">
        <div className="flex sm:grid sm:grid-cols-7 gap-1 text-xs min-w-max sm:min-w-0">
          {[
            { id: "agent" as StudioTab, label: "1. Agent" },
            { id: "intelligence" as StudioTab, label: "2. Intelligence" },
            { id: "languages" as StudioTab, label: "3. Languages" },
            { id: "calling" as StudioTab, label: "4. Calling" },
            { id: "engine" as StudioTab, label: "5. Engine" },
            { id: "tools" as StudioTab, label: "6. Tools & Integrations" },
            { id: "extractions" as StudioTab, label: "7. Extractions" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`py-2.5 px-3 sm:px-2 rounded-lg font-semibold transition-all text-center whitespace-nowrap ${
                activeTab === t.id
                  ? "bg-[#635BFF] text-white shadow-xs"
                  : "text-[#747B91] hover:text-[#20243A] hover:bg-[#F7F8FC]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-medium flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            className="font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {syncNotice && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium">
          {syncNotice}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1 — AGENT IDENTITY, BUSINESS CONTEXT & MASTER SYSTEM PROMPT       */}
      {/* ===================================================================== */}
      {activeTab === "agent" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-5 text-xs">
          <div>
            <h2 className="text-base font-bold text-[#20243A]">
              Tab 1: Agent Identity, Business Context & Master System Prompt
            </h2>
            <p className="text-[#747B91]">
              Configure the business identity, industry, objective, personality, greeting, and master system prompt.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Business / Organization Name (Text Input / Organization Selector) */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Business / Organization Name
              </label>
              {isSuperAdmin && organizations.length > 0 ? (
                <div className="space-y-1.5">
                  <select
                    value={formData.organizationId}
                    onChange={(e) => {
                      const oid = e.target.value;
                      const foundOrg = organizations.find(
                        (o) => String(o._id) === oid
                      );
                      updateField({
                        organizationId: oid,
                        businessName: foundOrg?.name || formData.businessName,
                      });
                    }}
                    className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                  >
                    {organizations.map((o) => (
                      <option key={o._id} value={o._id}>
                        {o.name} ({o._id})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) =>
                      updateField({ businessName: e.target.value })
                    }
                    placeholder="Display business name on calls..."
                    className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                  />
                </div>
              ) : (
                <input
                  type="text"
                  value={formData.businessName}
                  onChange={(e) =>
                    updateField({ businessName: e.target.value })
                  }
                  placeholder="e.g. Skyline Realty or MediCare Plus"
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              )}
            </div>

            {/* Industry (Searchable Dropdown + Custom) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-[#20243A]">
                  Industry <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={industrySearch}
                  onChange={(e) => setIndustrySearch(e.target.value)}
                  placeholder="Filter..."
                  className="w-24 px-2 py-0.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded text-[10px]"
                />
              </div>
              <select
                value={formData.industry}
                onChange={(e) => updateField({ industry: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              >
                {INDUSTRY_OPTIONS.filter(
                  (ind) =>
                    !industrySearch ||
                    ind.toLowerCase().includes(industrySearch.toLowerCase())
                ).map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
              {formData.industry === "Other" && (
                <input
                  type="text"
                  value={formData.customIndustry}
                  onChange={(e) =>
                    updateField({ customIndustry: e.target.value })
                  }
                  placeholder="Specify custom industry..."
                  className="mt-2 w-full px-3 py-2 bg-white border border-[#635BFF] rounded-lg"
                />
              )}
            </div>

            {/* Business Objective (Dropdown with Custom option) */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Business Objective <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.businessObjective}
                onChange={(e) =>
                  updateField({ businessObjective: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              >
                {BUSINESS_OBJECTIVE_OPTIONS.map((obj) => (
                  <option key={obj} value={obj}>
                    {obj}
                  </option>
                ))}
              </select>
              {formData.businessObjective === "Custom" && (
                <input
                  type="text"
                  value={formData.customBusinessObjective}
                  onChange={(e) =>
                    updateField({ customBusinessObjective: e.target.value })
                  }
                  placeholder="Enter custom business objective..."
                  className="mt-2 w-full px-3 py-2 bg-white border border-[#635BFF] rounded-lg"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Agent Description (Textarea) */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Agent Description
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => updateField({ description: e.target.value })}
                placeholder="Describe this agent's role, target audience, and service offerings..."
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              />
            </div>

            {/* Agent Personality (Dropdown with Custom option) */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Agent Personality <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.personality}
                onChange={(e) => updateField({ personality: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              >
                {AGENT_PERSONALITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {formData.personality === "Custom" && (
                <input
                  type="text"
                  value={formData.customPersonality}
                  onChange={(e) =>
                    updateField({ customPersonality: e.target.value })
                  }
                  placeholder="Describe custom personality style..."
                  className="mt-2 w-full px-3 py-2 bg-white border border-[#635BFF] rounded-lg"
                />
              )}
            </div>
          </div>

          {/* Agent Greeting Message (Textarea) */}
          <div>
            <label className="block font-semibold text-[#20243A] mb-1">
              Agent Greeting Message (`agent_welcome_message`){" "}
              <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={2}
              value={formData.greetingMessage}
              onChange={(e) =>
                updateField({ greetingMessage: e.target.value })
              }
              placeholder="Hello! Am I speaking with {lead_name}? This is calling from {company_name}."
              className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
            />
          </div>

          {/* System Prompt (Large Editable Textarea + AI Prompt Assistant – Gemini button) */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label className="font-semibold text-[#20243A]">
                System Prompt <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => handleOpenGeminiModal()}
                className="px-3 py-1 rounded-lg bg-[#EEF0FF] border border-[#C7CBFF] text-[#635BFF] font-bold hover:bg-[#635BFF] hover:text-white transition-colors"
              >
                ✨ AI Prompt Assistant – Gemini
              </button>
            </div>
            <textarea
              rows={7}
              value={formData.systemPrompt}
              onChange={(e) => updateField({ systemPrompt: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg font-mono text-[#20243A]"
            />
          </div>

          {/* Conversation Instructions & Default Fallback Response */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Conversation Instructions
              </label>
              <textarea
                rows={3}
                value={formData.conversationInstructions}
                onChange={(e) =>
                  updateField({ conversationInstructions: e.target.value })
                }
                placeholder="Turn-taking rules, pacing, active listening..."
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Default Fallback Response
              </label>
              <textarea
                rows={3}
                value={formData.fallbackMessage}
                onChange={(e) =>
                  updateField({ fallbackMessage: e.target.value })
                }
                placeholder="Polite clarification response when speech is unclear..."
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2 — INTELLIGENCE, LLM PARAMETERS & KNOWLEDGE BASE                 */}
      {/* ===================================================================== */}
      {activeTab === "intelligence" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-5 text-xs">
          <div>
            <h2 className="text-base font-bold text-[#20243A]">
              Tab 2: Intelligence, LLM Parameters & Knowledge Base
            </h2>
            <p className="text-[#747B91]">
              Configure the IndiaCalling Voice AI LLM provider, model, token/temperature limits, and attach real processed Knowledge Base sources from MongoDB.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* LLM Provider Dropdown */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                LLM Provider
              </label>
              <select
                value={formData.llmProvider}
                onChange={(e) => {
                  const prov = e.target.value;
                  const defaultMod =
                    BOLNA_SUPPORTED_LLM_MODELS[prov]?.[0] || "gpt-4o-mini";
                  updateField({ llmProvider: prov, llmModel: defaultMod });
                }}
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              >
                <option value="openai">OpenAI</option>
                <option value="azure">Azure OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="groq">Groq</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>

            {/* Dynamic Searchable Model Selection */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-[#20243A]">
                  Model Selection ({formData.llmProvider})
                </label>
                <input
                  type="text"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Filter models..."
                  className="w-28 px-2 py-0.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded text-[10px]"
                />
              </div>
              <select
                value={formData.llmModel}
                onChange={(e) => updateField({ llmModel: e.target.value })}
                disabled={!formData.llmProvider}
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg disabled:opacity-50"
              >
                {filteredModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sliders + Numerical Inputs for Max Tokens & Temperature */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-[#20243A]">
                  Maximum Output Tokens
                </label>
                <input
                  type="number"
                  min={50}
                  max={1000}
                  step={10}
                  value={formData.maxTokens}
                  onChange={(e) =>
                    updateField({
                      maxTokens: Math.min(
                        1000,
                        Math.max(50, Number(e.target.value) || 250)
                      ),
                    })
                  }
                  className="w-20 px-2 py-1 bg-white border border-[#E8EAF1] rounded font-mono text-center font-bold text-[#635BFF]"
                />
              </div>
              <input
                type="range"
                min={50}
                max={1000}
                step={10}
                value={formData.maxTokens}
                onChange={(e) =>
                  updateField({ maxTokens: Number(e.target.value) })
                }
                className="w-full accent-[#635BFF]"
              />
              <p className="text-[11px] text-[#747B91]">
                Recommended: 150–300 tokens for low-latency phone conversations.
              </p>
            </div>

            <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-[#20243A]">
                  Temperature
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={formData.temperature}
                  onChange={(e) =>
                    updateField({
                      temperature: Math.min(
                        1,
                        Math.max(0, parseFloat(e.target.value) || 0)
                      ),
                    })
                  }
                  className="w-20 px-2 py-1 bg-white border border-[#E8EAF1] rounded font-mono text-center font-bold text-[#635BFF]"
                />
              </div>
              <input
                type="range"
                min={0.0}
                max={1.0}
                step={0.05}
                value={formData.temperature}
                onChange={(e) =>
                  updateField({ temperature: parseFloat(e.target.value) })
                }
                className="w-full accent-[#635BFF]"
              />
              <p className="text-[11px] text-[#747B91]">
                Lower values (0.1–0.3) keep responses factual and consistent.
              </p>
            </div>
          </div>

          {/* Real Knowledge Base Selection (Part 4.5 & Part 6.3) */}
          <div className="space-y-3 pt-2 border-t border-[#E8EAF1]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="font-bold text-[#20243A]">
                  Knowledge Base Selection (Searchable Multi-Select)
                </label>
                <p className="text-[11px] text-[#747B91]">
                  Select processed, Ready knowledge sources belonging to your organization. Only Ready sources can be enabled.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {knowledgeBases.length > 3 && (
                  <input
                    type="text"
                    value={kbSearch}
                    onChange={(e) => setKbSearch(e.target.value)}
                    placeholder="Search knowledge bases..."
                    className="px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                  />
                )}
                <Link
                  href="/knowledge-base"
                  className="px-3 py-1.5 bg-[#EEF0FF] text-[#635BFF] rounded-lg font-semibold hover:bg-[#635BFF] hover:text-white"
                >
                  + Manage Knowledge Base
                </Link>
              </div>
            </div>

            {loadingKbs ? (
              <div className="p-6 bg-[#F7F8FC] rounded-xl flex flex-col items-center justify-center space-y-2 border border-[#E8EAF1]">
                <LoadingSpinner size="md" color="text-[#635BFF]" />
                <span className="text-xs font-semibold text-[#747B91] animate-pulse">
                  Loading organization Knowledge Bases from MongoDB...
                </span>
              </div>
            ) : authorizedKbs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {authorizedKbs.map((kb) => {
                  const kbIdStr = String(kb._id);
                  const checked = formData.knowledgeBaseIds.includes(kbIdStr);
                  const isUsable =
                    kb.status === "active" && kb.processingStatus === "ready";
                  const docCount =
                    kb.documentCount ?? (kb.documents || []).length;

                  return (
                    <label
                      key={kbIdStr}
                      className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border transition-colors ${
                        !isUsable
                          ? "opacity-60 cursor-not-allowed bg-gray-50 border-gray-200"
                          : checked
                          ? "border-[#635BFF] bg-[#EEF0FF] cursor-pointer"
                          : "border-[#E8EAF1] bg-[#F7F8FC] hover:bg-white cursor-pointer"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          disabled={!isUsable}
                          checked={checked}
                          onChange={(e) => {
                            if (!isUsable) return;
                            const next = e.target.checked
                              ? [...formData.knowledgeBaseIds, kbIdStr]
                              : formData.knowledgeBaseIds.filter(
                                  (id) => id !== kbIdStr
                                );
                            updateField({ knowledgeBaseIds: next });
                          }}
                          className="mt-0.5 accent-[#635BFF]"
                        />
                        <div>
                          <p className="font-bold text-[#20243A]">{kb.name}</p>
                          <p className="text-[11px] text-[#747B91]">
                            {kb.category} • {docCount} document(s) •{" "}
                            {kb.totalChunks ?? 0} chunks
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          kb.processingStatus === "ready"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : kb.processingStatus === "failed"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {kb.processingStatus}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 bg-[#F7F8FC] border border-dashed border-[#C7CBFF] rounded-xl text-center space-y-2">
                <p className="font-semibold text-[#20243A]">
                  No Knowledge Bases Found for This Organization
                </p>
                <p className="text-[11px] text-[#747B91]">
                  Upload PDF, TXT, DOCX, or CSV documents in the Knowledge Base module to ground your agent in verified business facts.
                </p>
                <Link
                  href="/knowledge-base"
                  className="inline-block px-4 py-2 bg-[#635BFF] text-white rounded-lg font-semibold"
                >
                  Open Knowledge Base Module →
                </Link>
              </div>
            )}

            {/* Selected Knowledge Sources Summary Pills */}
            {formData.knowledgeBaseIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="font-semibold text-[#20243A]">
                  Selected Sources ({formData.knowledgeBaseIds.length}):
                </span>
                {formData.knowledgeBaseIds.map((id) => {
                  const matched = knowledgeBases.find(
                    (k) => String(k._id) === id
                  );
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#EEF0FF] border border-[#C7CBFF] text-[#635BFF] font-semibold text-[11px]"
                    >
                      <span>{matched?.name || id}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateField({
                            knowledgeBaseIds: formData.knowledgeBaseIds.filter(
                              (k) => k !== id
                            ),
                          })
                        }
                        className="font-bold hover:text-rose-600"
                      >
                        ✕
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Conversation Context & Advanced Instructions (Distinct from Tab 1) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E8EAF1]">
            <div>
              <label className="block font-semibold text-[#20243A] mb-0.5">
                Conversation Context
              </label>
              <p className="text-[11px] text-[#747B91] mb-1.5">
                Explains the situational background of the call (e.g. why the call is happening, prior inquiry source, or campaign offer).
              </p>
              <textarea
                rows={3}
                value={formData.conversationContext}
                onChange={(e) =>
                  updateField({ conversationContext: e.target.value })
                }
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#20243A] mb-0.5">
                Advanced Instructions
              </label>
              <p className="text-[11px] text-[#747B91] mb-1.5">
                Strict compliance guardrails, escalation triggers, and pricing/policy constraints.
              </p>
              <textarea
                rows={3}
                value={formData.advancedInstructions}
                onChange={(e) =>
                  updateField({ advancedInstructions: e.target.value })
                }
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3 — LANGUAGES (Part 6.4)                                          */}
      {/* ===================================================================== */}
      {activeTab === "languages" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-5 text-xs">
          <div>
            <h2 className="text-base font-bold text-[#20243A]">
              Tab 3: Languages & Multilingual Switching
            </h2>
            <p className="text-[#747B91]">
              Configure primary language, supported languages, automatic language switching, and default fallback language.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Primary Language (Single Dropdown, showing 1 time) */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Primary Language
              </label>
              <select
                value={formData.language}
                onChange={(e) =>
                  updateField({
                    language: e.target.value,
                    defaultLanguage: e.target.value,
                    voiceLanguage: e.target.value,
                  })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg font-medium text-[#20243A]"
              >
                {BOLNA_SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.label} value={l.label}>
                    {l.label} — {l.note} (ISO: {l.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Language Switching Toggle */}
            <div className="p-3.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl flex flex-col justify-center space-y-1.5">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="font-semibold text-[#20243A]">
                  Language Switching
                </span>
                <input
                  type="checkbox"
                  checked={formData.multilingualEnabled}
                  onChange={(e) =>
                    updateField({ multilingualEnabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#635BFF]"
                />
              </label>
              <p className="text-[11px] text-[#747B91]">
                Allow dynamic code-switching when the caller switches languages mid-call.
              </p>
            </div>
          </div>

          {/* Supported Languages Multi-Select */}
          <div>
            <label className="block font-semibold text-[#20243A] mb-1.5">
              Supported Languages (Multi-Select)
            </label>
            <div className="flex flex-wrap gap-2">
              {BOLNA_SUPPORTED_LANGUAGES.map((langObj) => {
                const lang = langObj.label;
                const active = formData.additionalLanguages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? formData.additionalLanguages.filter((l) => l !== lang)
                        : [...formData.additionalLanguages, lang];
                      updateField({ additionalLanguages: next });
                    }}
                    className={`px-3.5 py-2 rounded-lg border font-semibold transition-colors ${
                      active
                        ? "bg-[#EEF0FF] border-[#635BFF] text-[#635BFF]"
                        : "bg-[#F7F8FC] border-[#E8EAF1] text-[#747B91] hover:text-[#20243A]"
                    }`}
                  >
                    {active ? "✓ " : ""}
                    {lang}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[#20243A] mb-1">
              Language-Specific Instructions
            </label>
            <textarea
              rows={3}
              value={formData.languageInstructions}
              onChange={(e) =>
                updateField({ languageInstructions: e.target.value })
              }
              className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
            />
          </div>

          {/* Curated Voice Section (IndiaCalling Voice AI UI Aligned) */}
          <div className="pt-4 border-t border-[#E8EAF1] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#20243A]">Voice</h3>
                <p className="text-[11px] text-[#747B91]">
                  Select from curated, production-tested voices with status indicators.
                </p>
              </div>
              <span className="text-[11px] font-semibold text-[#635BFF] bg-[#EEF0FF] px-2.5 py-0.5 rounded-full">
                {getVisibleCuratedVoices().length} Curated Voices
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {getVisibleCuratedVoices().map((voice) => {
                const selected = formData.voiceId === voice.voiceId;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() =>
                      updateField({
                        voiceProvider: voice.provider,
                        voiceModel: voice.model,
                        voiceId: voice.voiceId,
                        voiceName: voice.name,
                      })
                    }
                    className={`text-left p-3.5 rounded-xl border transition-all ${
                      selected
                        ? "border-[#635BFF] bg-[#EEF0FF]/60 ring-1 ring-[#635BFF]/30"
                        : "border-[#E8EAF1] bg-[#F7F8FC] hover:border-[#635BFF]/50 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#20243A] truncate">
                        {voice.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                          voice.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {voice.status === "active" ? "Active" : "In Development"}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#747B91] mt-1">
                      {voice.provider} • {voice.model} • {voice.accent}
                    </p>
                    <p className="text-[11px] text-[#747B91] mt-1 line-clamp-2">
                      {voice.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pronunciation Section (Word -> Pronounce As, IndiaCalling Voice AI UI Aligned) */}
          <div className="pt-4 border-t border-[#E8EAF1] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#20243A]">
                  Pronunciation Dictionary
                </h3>
                <p className="text-[11px] text-[#747B91]">
                  Define custom pronunciations for brand names, acronyms, or regional terms.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBulkPronImport((v) => !v);
                  setBulkPronFeedback(null);
                }}
                className="px-3 py-1.5 rounded-lg border border-[#C7CBFF] bg-[#EEF0FF] text-[#635BFF] hover:bg-[#635BFF] hover:text-white text-[11px] font-semibold transition"
              >
                {showBulkPronImport ? "Close Bulk Import" : "Bulk Import Dictionary"}
              </button>
            </div>

            {showBulkPronImport && (
              <div className="p-3.5 rounded-xl bg-[#F7F8FC] border border-[#C7CBFF] space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[#20243A]">
                    Paste lines (<code>Word -&gt; Pronunciation</code> or CSV) or upload <code>.csv</code> / <code>.json</code>
                  </span>
                  <label className="px-2.5 py-1 rounded-lg bg-white border border-[#E8EAF1] hover:border-[#635BFF] text-[11px] font-semibold text-[#20243A] cursor-pointer">
                    Upload .CSV / .JSON
                    <input
                      type="file"
                      accept=".csv,.txt,.json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          mergeBulkPronunciations(String(reader.result || ""));
                        };
                        reader.readAsText(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <textarea
                  rows={3}
                  value={bulkPronText}
                  onChange={(e) => setBulkPronText(e.target.value)}
                  placeholder={"HDFC -> H D F C\nEMI -> E M I\nBHK -> B H K"}
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg font-mono text-[11px] text-[#20243A] focus:outline-none focus:border-[#635BFF]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-[#747B91]">
                    {bulkPronFeedback || "Duplicate words are automatically updated."}
                  </span>
                  <button
                    type="button"
                    onClick={() => mergeBulkPronunciations(bulkPronText)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#635BFF] hover:bg-[#5046E5] text-white text-[11px] font-semibold"
                  >
                    Import Entries
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <input
                type="text"
                value={newPronWord}
                onChange={(e) => setNewPronWord(e.target.value)}
                placeholder="Word, e.g. HDFC or EMI"
                className="sm:col-span-5 px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF]"
              />
              <input
                type="text"
                value={newPronAs}
                onChange={(e) => setNewPronAs(e.target.value)}
                placeholder="Pronounce as, e.g. H D F C or ई एम आई"
                className="sm:col-span-5 px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs text-[#20243A] focus:outline-none focus:border-[#635BFF]"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newPronWord.trim() || !newPronAs.trim()) return;
                  setPronunciations((prev) => [
                    ...prev,
                    { word: newPronWord.trim(), pronounceAs: newPronAs.trim() },
                  ]);
                  setNewPronWord("");
                  setNewPronAs("");
                }}
                className="sm:col-span-2 px-3 py-2 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg text-xs font-semibold transition"
              >
                Add Word
              </button>
            </div>
            {pronunciations.length > 0 && (
              <div className="space-y-1.5">
                {pronunciations.map((pItem, idx) => (
                  <div
                    key={`${pItem.word}-${idx}`}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#F7F8FC] border border-[#E8EAF1] text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#20243A]">{pItem.word}</span>
                      <span className="mx-2 text-[#747B91]">→</span>
                      <span className="text-[#635BFF] font-medium">{pItem.pronounceAs}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPronunciations((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-rose-600 hover:underline text-[11px] font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transcription Section (IndiaCalling Voice AI UI Aligned) */}
          <div className="pt-4 border-t border-[#E8EAF1] space-y-3">
            <div>
              <h3 className="text-sm font-bold text-[#20243A]">Transcription</h3>
              <p className="text-[11px] text-[#747B91]">
                Configure ASR provider, model, domain keywords, and recognition context.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Transcription Provider
                </label>
                <select
                  value={formData.transcriberProvider}
                  onChange={(e) =>
                    updateField({ transcriberProvider: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                >
                  <option value="deepgram">Deepgram</option>
                  <option value="sarvam">Sarvam ASR</option>
                  <option value="azure">Azure Speech</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Transcription Model
                </label>
                <select
                  value={formData.transcriberModel}
                  onChange={(e) =>
                    updateField({ transcriberModel: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                >
                  <option value="nova-2">nova-2 (Recommended)</option>
                  <option value="nova-3">nova-3</option>
                  <option value="saarika:v2">saarika:v2 (Indian Languages)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Keywords (Weighted Boost)
                </label>
                <input
                  type="text"
                  value={transcriptionKeywords}
                  onChange={(e) => setTranscriptionKeywords(e.target.value)}
                  placeholder="IndiaCalling:5, account number:2, EMI:3, site visit:4"
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Recognition Context
                </label>
                <input
                  type="text"
                  value={transcriptionContext}
                  onChange={(e) => setTranscriptionContext(e.target.value)}
                  placeholder="Outbound qualification line for real estate / SaaS inquiries..."
                  className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg text-xs"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4 — CALLING CONFIGURATION (Part 6.5)                              */}
      {/* ===================================================================== */}
      {activeTab === "calling" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-5 text-xs">
          <div>
            <h2 className="text-base font-bold text-[#20243A]">
              Tab 4: Calling Configuration & Compliance Schedule
            </h2>
            <p className="text-[#747B91]">
              Configure call direction, telephony trunk provider, timezone, calling schedule, retry policy, and maximum call duration.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {/* Call Direction */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Call Direction
              </label>
              <select
                value={formData.agentType}
                onChange={(e) =>
                  updateField({
                    agentType: e.target.value as "outbound" | "inbound" | "both",
                  })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              >
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
                <option value="both">Both (Inbound & Outbound)</option>
              </select>
            </div>

            {/* Telephony Provider */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Telephony Provider
              </label>
              <select
                value={formData.telephonyProvider}
                onChange={(e) =>
                  updateField({ telephonyProvider: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              >
                <option value="plivo">Plivo (IndiaCalling Voice AI Default Trunk)</option>
                <option value="exotel">Exotel India</option>
                <option value="twilio">Twilio</option>
              </select>
            </div>

            {/* Configured Phone Number Selector */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Phone Number (Caller ID)
              </label>
              <input
                type="text"
                value={formData.phoneNumber}
                onChange={(e) => updateField({ phoneNumber: e.target.value })}
                placeholder="Blank = IndiaCalling Voice AI Default Account Route"
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg font-mono"
              />
            </div>

            {/* Calling Timezone */}
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Calling Timezone
              </label>
              <select
                value={formData.scheduleTimezone}
                onChange={(e) =>
                  updateField({ scheduleTimezone: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>

          {/* Calling Schedule (Days + Time Window) */}
          <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-3">
            <label className="block font-bold text-[#20243A]">
              Allowed Calling Schedule & Days (09:00–21:00 Permitted Window)
            </label>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-1.5">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => {
                  const active = formData.allowedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const next = active
                          ? formData.allowedDays.filter((d) => d !== day)
                          : [...formData.allowedDays, day];
                        updateField({ allowedDays: next });
                      }}
                      className={`px-3 py-1.5 rounded-lg font-semibold border ${
                        active
                          ? "bg-[#635BFF] text-white border-[#635BFF]"
                          : "bg-white text-[#747B91] border-[#E8EAF1]"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={formData.callingStartHour}
                  onChange={(e) =>
                    updateField({ callingStartHour: e.target.value })
                  }
                  className="px-3 py-1.5 bg-white border border-[#E8EAF1] rounded-lg"
                />
                <span>to</span>
                <input
                  type="time"
                  value={formData.callingEndHour}
                  onChange={(e) =>
                    updateField({ callingEndHour: e.target.value })
                  }
                  className="px-3 py-1.5 bg-white border border-[#E8EAF1] rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Retry Policy & Maximum Call Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Max Retry Attempts
              </label>
              <input
                type="number"
                min={0}
                max={5}
                value={formData.maxRetries}
                onChange={(e) =>
                  updateField({ maxRetries: Number(e.target.value) || 0 })
                }
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Retry Interval (Minutes)
              </label>
              <input
                type="number"
                min={5}
                max={1440}
                value={formData.retryIntervalMinutes}
                onChange={(e) =>
                  updateField({
                    retryIntervalMinutes: Number(e.target.value) || 60,
                  })
                }
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Max Call Duration (s): {formData.maxDurationSeconds}s
              </label>
              <input
                type="range"
                min={60}
                max={1800}
                step={30}
                value={formData.maxDurationSeconds}
                onChange={(e) =>
                  updateField({ maxDurationSeconds: Number(e.target.value) })
                }
                className="w-full accent-[#635BFF] mt-2"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#20243A] mb-1">
                Silence Hangup (s)
              </label>
              <input
                type="number"
                min={5}
                max={60}
                value={formData.hangupAfterSilenceSeconds}
                onChange={(e) =>
                  updateField({
                    hangupAfterSilenceSeconds: Number(e.target.value) || 12,
                  })
                }
                className="w-full px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
              />
            </div>

            {/* AI Hangup Call Feature (On / Off Toggle) */}
            <div className="sm:col-span-2 p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#20243A] text-sm">
                    AI Hangup Call (Automatic Disconnect)
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      formData.aiHangupEnabled
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-gray-200 text-gray-700 border border-gray-300"
                    }`}
                  >
                    {formData.aiHangupEnabled ? "ON" : "OFF"}
                  </span>
                </div>
                <p className="text-[11px] text-[#747B91] mt-1 max-w-xl">
                  {formData.aiHangupEnabled
                    ? "Enabled: AI agent is authorized to politely conclude the conversation and hang up the call once the qualification or objective is complete, or when the user says goodbye."
                    : "Disabled: AI agent will never hang up on the caller. The call will stay connected until the customer hangs up."}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-[#747B91]">
                  {formData.aiHangupEnabled ? "Enabled" : "Disabled"}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.aiHangupEnabled}
                    onChange={(e) =>
                      updateField({ aiHangupEnabled: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5 — VOICE & ENGINE CONFIGURATION (Part 6.6)                       */}
      {/* ===================================================================== */}
      {activeTab === "engine" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-6 text-xs">
          <div>
            <h2 className="text-base font-bold text-[#20243A]">
              Tab 5: Engine, Latency &amp; Call Flow Controls
            </h2>
            <p className="text-[#747B91] mt-0.5">
              Voice &amp; Transcription settings live in Tab 3 (Languages). Tune response latency, interruptions, call management, final call message, and user detection here.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] space-y-3">
            <h3 className="text-sm font-bold text-[#20243A]">1. Response Latency</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Endpointing Threshold (ms): {formData.endpointingMs}ms
                </label>
                <input
                  type="range"
                  min={100}
                  max={800}
                  step={25}
                  value={formData.endpointingMs}
                  onChange={(e) => updateField({ endpointingMs: Number(e.target.value) })}
                  className="w-full accent-[#635BFF]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Incremental Delay (ms): {incrementalDelayMs}ms
                </label>
                <input
                  type="range"
                  min={100}
                  max={1000}
                  step={50}
                  value={incrementalDelayMs}
                  onChange={(e) => setIncrementalDelayMs(Number(e.target.value))}
                  className="w-full accent-[#635BFF]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Audio Buffer Size: {formData.bufferSize}
                </label>
                <input
                  type="number"
                  min={50}
                  max={1000}
                  value={formData.bufferSize}
                  onChange={(e) => updateField({ bufferSize: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] space-y-3">
            <h3 className="text-sm font-bold text-[#20243A]">
              2. Transcription &amp; Interruption Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Words Required for Interruption
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={formData.interruptionWords}
                  onChange={(e) => updateField({ interruptionWords: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div className="relative">
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="font-semibold text-[#20243A]">
                    Sampling Rate (Hz)
                  </label>
                  <button
                    type="button"
                    onMouseEnter={() => setShowSamplingRateTip(true)}
                    onMouseLeave={() => setShowSamplingRateTip(false)}
                    onFocus={() => setShowSamplingRateTip(true)}
                    onBlur={() => setShowSamplingRateTip(false)}
                    onClick={() => setShowSamplingRateTip((v) => !v)}
                    aria-label="What is Sampling Rate?"
                    className="w-4 h-4 rounded-full bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF] text-[10px] font-bold inline-flex items-center justify-center hover:bg-[#635BFF] hover:text-white transition"
                  >
                    ?
                  </button>
                </div>
                {showSamplingRateTip && (
                  <div className="absolute z-30 right-0 sm:left-0 top-7 w-72 p-3 rounded-xl bg-[#20243A] text-white text-[11px] leading-relaxed shadow-xl border border-white/10">
                    <p className="font-semibold text-emerald-300 mb-1">Audio Sampling Rate Guide</p>
                    <p><strong>16,000 Hz (Wideband HD):</strong> Recommended for clearer Indian accents, Hindi/English speech recognition, and modern VoIP/SIP trunks.</p>
                    <p className="mt-1"><strong>8,000 Hz (Standard PSTN):</strong> Narrowband fallback for legacy carrier trunks.</p>
                  </div>
                )}
                <select
                  value={formData.samplingRate}
                  onChange={(e) => updateField({ samplingRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg"
                >
                  <option value={8000}>8,000 Hz (Standard PSTN Telephony)</option>
                  <option value={16000}>16,000 Hz (Wideband HD Audio)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] space-y-3">
            <h3 className="text-sm font-bold text-[#20243A]">3. Call Management</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Max Call Duration (seconds)
                </label>
                <input
                  type="number"
                  min={60}
                  max={1800}
                  value={formData.maxDurationSeconds}
                  onChange={(e) => updateField({ maxDurationSeconds: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Hangup After Silence (seconds)
                </label>
                <input
                  type="number"
                  min={5}
                  max={90}
                  value={formData.hangupAfterSilenceSeconds}
                  onChange={(e) =>
                    updateField({ hangupAfterSilenceSeconds: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  id="aiHangupEngine"
                  type="checkbox"
                  checked={formData.aiHangupEnabled}
                  onChange={(e) => updateField({ aiHangupEnabled: e.target.checked })}
                  className="w-4 h-4 accent-[#635BFF]"
                />
                <label htmlFor="aiHangupEngine" className="font-semibold text-[#20243A]">
                  Allow AI Graceful Hangup
                </label>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] space-y-2">
            <h3 className="text-sm font-bold text-[#20243A]">4. Final Call Message</h3>
            <input
              type="text"
              value={finalCallMessage}
              onChange={(e) => {
                setFinalCallMessage(e.target.value);
                updateField({ closingMessage: e.target.value });
              }}
              placeholder="e.g. Thank you for speaking with us today. Have a great day!"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E8EAF1] rounded-lg text-xs"
            />
          </div>

          <div className="p-4 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] space-y-3">
            <h3 className="text-sm font-bold text-[#20243A]">5. User Detection</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <label className="flex items-center gap-2 font-semibold text-[#20243A]">
                <input
                  type="checkbox"
                  checked={checkUserOnline}
                  onChange={(e) => setCheckUserOnline(e.target.checked)}
                  className="w-4 h-4 accent-[#635BFF]"
                />
                Check if caller is still on the line during silence
              </label>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Prompt &ldquo;Are you still there?&rdquo; after (seconds)
                </label>
                <input
                  type="number"
                  min={5}
                  max={30}
                  disabled={!checkUserOnline}
                  value={userOnlineTriggerSec}
                  onChange={(e) => setUserOnlineTriggerSec(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "tools" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-6 text-xs">
          <div>
            <h2 className="text-base font-bold text-[#20243A]">
              Tools & Integrations
            </h2>
            <p className="text-[#747B91] mt-1">
              Connect your AI agent with external services, automate lead management, schedule appointments and configure human handoff.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CARD A: CRM INTEGRATION */}
            {(() => {
              const isCrmEnabled =
                formData.enabledIntegrations.includes("crm_sync") ||
                formData.crmProvider !== "none";
              return (
                <div
                  className={`p-5 rounded-xl border transition-all ${
                    isCrmEnabled
                      ? "border-[#635BFF] bg-[#F9F9FE]"
                      : "border-[#E8EAF1] bg-[#F7F8FC]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                          isCrmEnabled
                            ? "bg-[#EEF0FF] text-[#635BFF]"
                            : "bg-white text-[#747B91] border border-[#E8EAF1]"
                        }`}
                      >
                        💼
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-[#20243A]">
                            CRM Integration
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              isCrmEnabled
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {isCrmEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#747B91] mt-0.5">
                          Automatically send qualified lead information to your CRM.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isCrmEnabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next = checked
                            ? Array.from(
                                new Set([...formData.enabledIntegrations, "crm_sync"])
                              )
                            : formData.enabledIntegrations.filter(
                                (x) => x !== "crm_sync"
                              );
                          updateField({
                            enabledIntegrations: next,
                            crmProvider: checked
                              ? formData.crmProvider === "none"
                                ? "india_calling_crm"
                                : formData.crmProvider
                              : "none",
                          });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#635BFF]"></div>
                    </label>
                  </div>

                  {isCrmEnabled && (
                    <div className="space-y-3 pt-3 border-t border-[#E8EAF1]">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#20243A] mb-1">
                          CRM Provider
                        </label>
                        <select
                          value={
                            formData.crmProvider === "none"
                              ? "india_calling_crm"
                              : formData.crmProvider
                          }
                          onChange={(e) =>
                            updateField({ crmProvider: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs"
                        >
                          <option value="india_calling_crm">
                            IndiaCalling Built-in CRM (Default)
                          </option>
                          <option value="hubspot">HubSpot (Webhook Bridge)</option>
                          <option value="salesforce">
                            Salesforce (Webhook Bridge)
                          </option>
                          <option value="zoho_crm">Zoho CRM (Webhook Bridge)</option>
                          <option value="leadsquared">
                            LeadSquared (Webhook Bridge)
                          </option>
                        </select>
                      </div>

                      {formData.crmProvider === "none" ||
                      formData.crmProvider === "india_calling_crm" ? (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-800 flex items-start gap-1.5">
                          <span>✓</span>
                          <span>
                            Built-in IndiaCalling Lead Pipeline is active. Leads are
                            automatically saved and scored without needing external
                            API credentials.
                          </span>
                        </div>
                      ) : (
                        <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-[11px] text-indigo-800">
                          External CRM integration active. Qualified lead payloads
                          will be dispatched to your provider via the webhook bridge.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* CARD B: APPOINTMENT BOOKING */}
            {(() => {
              const isBookingEnabled =
                formData.appointmentToolEnabled ||
                formData.enabledIntegrations.includes("calendar_booking") ||
                formData.calendarProvider !== "none";
              return (
                <div
                  className={`p-5 rounded-xl border transition-all ${
                    isBookingEnabled
                      ? "border-[#635BFF] bg-[#F9F9FE]"
                      : "border-[#E8EAF1] bg-[#F7F8FC]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                          isBookingEnabled
                            ? "bg-[#EEF0FF] text-[#635BFF]"
                            : "bg-white text-[#747B91] border border-[#E8EAF1]"
                        }`}
                      >
                        📅
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-[#20243A]">
                            Appointment Booking
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              isBookingEnabled
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {isBookingEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#747B91] mt-0.5">
                          Allow the AI agent to schedule appointments during
                          conversations.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isBookingEnabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next = checked
                            ? Array.from(
                                new Set([
                                  ...formData.enabledIntegrations,
                                  "calendar_booking",
                                ])
                              )
                            : formData.enabledIntegrations.filter(
                                (x) => x !== "calendar_booking"
                              );
                          updateField({
                            appointmentToolEnabled: checked,
                            enabledIntegrations: next,
                            calendarProvider: checked
                              ? formData.calendarProvider === "none"
                                ? "cal_com"
                                : formData.calendarProvider
                              : "none",
                          });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#635BFF]"></div>
                    </label>
                  </div>

                  {isBookingEnabled && (
                    <div className="space-y-3 pt-3 border-t border-[#E8EAF1]">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#20243A] mb-1">
                          Calendar Provider
                        </label>
                        <select
                          value={
                            formData.calendarProvider === "none"
                              ? "cal_com"
                              : formData.calendarProvider
                          }
                          onChange={(e) =>
                            updateField({ calendarProvider: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs"
                        >
                          <option value="cal_com">Cal.com Scheduling</option>
                          <option value="calendly">Calendly</option>
                          <option value="google_calendar">
                            Google Calendar Booking
                          </option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-[#747B91] mb-1">
                          Booking Webhook / API Endpoint
                        </label>
                        <input
                          type="url"
                          value={formData.appointmentWebhookUrl}
                          onChange={(e) =>
                            updateField({
                              appointmentWebhookUrl: e.target.value,
                            })
                          }
                          placeholder="https://api.example.com/calendar/book"
                          className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg font-mono text-xs"
                        />
                      </div>
                      <p className="text-[10px] text-[#747B91]">
                        The agent will check availability and confirm slots during the
                        call via this calendar provider.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* CARD C: WEBHOOKS (ADVANCED CONFIGURATION) */}
            {(() => {
              const isWebhookEnabled =
                formData.enabledIntegrations.includes("webhook_dispatch");
              const hasConfiguredUrl = Boolean(
                formData.webhookUrl && formData.webhookUrl.trim().length > 0
              );
              return (
                <div
                  className={`p-5 rounded-xl border transition-all ${
                    isWebhookEnabled
                      ? "border-[#635BFF] bg-[#F9F9FE]"
                      : "border-[#E8EAF1] bg-[#F7F8FC]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                          isWebhookEnabled
                            ? "bg-[#EEF0FF] text-[#635BFF]"
                            : "bg-white text-[#747B91] border border-[#E8EAF1]"
                        }`}
                      >
                        ⚡
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-[#20243A]">
                            Real-Time Webhooks
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              !isWebhookEnabled
                                ? "bg-slate-100 text-slate-500 border-slate-200"
                                : hasConfiguredUrl
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {!isWebhookEnabled
                              ? "Disabled"
                              : hasConfiguredUrl
                              ? "Configured"
                              : "URL Required"}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#747B91] mt-0.5">
                          Send call events and lead qualification results to external
                          applications.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isWebhookEnabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next = checked
                            ? Array.from(
                                new Set([
                                  ...formData.enabledIntegrations,
                                  "webhook_dispatch",
                                ])
                              )
                            : formData.enabledIntegrations.filter(
                                (x) => x !== "webhook_dispatch"
                              );
                          updateField({ enabledIntegrations: next });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#635BFF]"></div>
                    </label>
                  </div>

                  {isWebhookEnabled && (
                    <div className="pt-3 border-t border-[#E8EAF1] space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#20243A] mb-1">
                          Endpoint URL (POST)
                        </label>
                        <input
                          type="url"
                          value={formData.webhookUrl}
                          onChange={(e) =>
                            updateField({ webhookUrl: e.target.value })
                          }
                          placeholder="https://your-crm.example.com/webhooks/bolna"
                          className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg font-mono text-xs"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setShowAdvancedWebhooks(!showAdvancedWebhooks)
                        }
                        className="flex items-center gap-1.5 text-xs font-semibold text-[#635BFF] hover:underline"
                      >
                        <span>
                          {showAdvancedWebhooks
                            ? "Hide Advanced Settings ▲"
                            : "Show Advanced Configuration ▼"}
                        </span>
                      </button>

                      {showAdvancedWebhooks && (
                        <div className="p-3 bg-white border border-[#E8EAF1] rounded-lg space-y-3">
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <span className="text-[#747B91] block">
                                HTTP Method
                              </span>
                              <span className="font-semibold text-[#20243A]">
                                POST (JSON)
                              </span>
                            </div>
                            <div>
                              <span className="text-[#747B91] block">
                                Retry Policy
                              </span>
                              <span className="font-semibold text-[#20243A]">
                                3 attempts, exponential backoff
                              </span>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-[#747B91] mb-1">
                              Signing Secret (Server-side HMAC verification)
                            </label>
                            <input
                              type="password"
                              value={formData.webhookSecret}
                              onChange={(e) =>
                                updateField({ webhookSecret: e.target.value })
                              }
                              placeholder="whsec_••••••••••••"
                              className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-md font-mono text-xs"
                            />
                            <p className="text-[10px] text-[#747B91] mt-0.5">
                              Kept encrypted server-side; used to sign payload
                              signatures.
                            </p>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-[#747B91] mb-1.5">
                              Subscribed Backend Events
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                { id: "call_started", label: "Call Started" },
                                {
                                  id: "call_completed",
                                  label: "Call Completed",
                                },
                                {
                                  id: "lead_qualified",
                                  label: "Lead Qualified",
                                },
                                { id: "call_failed", label: "Call Failed" },
                              ].map((ev) => {
                                const selected =
                                  selectedWebhookEvents.includes(ev.id);
                                return (
                                  <label
                                    key={ev.id}
                                    className="flex items-center gap-1.5 text-[11px] text-[#20243A] cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={(e) => {
                                        setSelectedWebhookEvents(
                                          e.target.checked
                                            ? [...selectedWebhookEvents, ev.id]
                                            : selectedWebhookEvents.filter(
                                                (x) => x !== ev.id
                                              )
                                        );
                                      }}
                                      className="rounded accent-[#635BFF] w-3.5 h-3.5"
                                    />
                                    <span>{ev.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* CARD D: HUMAN HANDOFF */}
            {(() => {
              const isHandoffEnabled =
                formData.callTransferEnabled ||
                formData.enabledIntegrations.includes("human_handoff");
              return (
                <div
                  className={`p-5 rounded-xl border transition-all ${
                    isHandoffEnabled
                      ? "border-[#635BFF] bg-[#F9F9FE]"
                      : "border-[#E8EAF1] bg-[#F7F8FC]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                          isHandoffEnabled
                            ? "bg-[#EEF0FF] text-[#635BFF]"
                            : "bg-white text-[#747B91] border border-[#E8EAF1]"
                        }`}
                      >
                        🎧
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-[#20243A]">
                            Human Handoff
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              isHandoffEnabled
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            {isHandoffEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#747B91] mt-0.5">
                          Transfer important or qualified conversations to a human
                          sales representative.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isHandoffEnabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next = checked
                            ? Array.from(
                                new Set([
                                  ...formData.enabledIntegrations,
                                  "human_handoff",
                                ])
                              )
                            : formData.enabledIntegrations.filter(
                                (x) => x !== "human_handoff"
                              );
                          updateField({
                            callTransferEnabled: checked,
                            enabledIntegrations: next,
                          });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#635BFF]"></div>
                    </label>
                  </div>

                  {isHandoffEnabled && (
                    <div className="space-y-3 pt-3 border-t border-[#E8EAF1]">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#20243A] mb-1">
                          Transfer Destination (Strict E.164 Phone Number)
                        </label>
                        <input
                          type="text"
                          value={formData.warmTransferNumber}
                          onChange={(e) =>
                            updateField({ warmTransferNumber: e.target.value })
                          }
                          onBlur={(e) => {
                            const formatted = formatTransferPhoneE164(e.target.value);
                            if (formatted && formatted !== e.target.value) {
                              updateField({ warmTransferNumber: formatted });
                            }
                          }}
                          placeholder="+919829271706"
                          className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg font-mono text-xs"
                        />
                        <p className="text-[10px] text-[#747B91] mt-1">
                          10-digit Indian numbers auto-format to <code className="font-mono text-[#20243A]">+91XXXXXXXXXX</code> on blur. Live call transfer executes on real PSTN/SIP telephony calls (not browser WebRTC test calls).
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#20243A] mb-1">
                            Target Department
                          </label>
                          <input
                            type="text"
                            value={formData.handoffDepartment}
                            onChange={(e) =>
                              updateField({ handoffDepartment: e.target.value })
                            }
                            placeholder="Sales Desk"
                            className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#20243A] mb-1">
                            Transfer Condition
                          </label>
                          <select
                            value={transferCondition}
                            onChange={(e) =>
                              setTransferCondition(e.target.value)
                            }
                            className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg text-xs"
                          >
                            <option value="High-intent caller or requested transfer to human agent">
                              High Intent or Caller Request
                            </option>
                            <option value="Lead Qualification Met (Threshold >= 70)">
                              Qualified Leads Only
                            </option>
                            <option value="Complex Objection / Escalation">
                              Complex Inquiries & Escalations
                            </option>
                          </select>
                        </div>
                      </div>

                      <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-800">
                        <strong>Handoff vs Telephony:</strong> Live telephone
                        warm-transfer dials this number when supported by your
                        telephony trunk. When off-hook transfer is unavailable,
                        qualified leads are routed to your department in the
                        IndiaCalling Leads Desk.
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 7 — EXTRACTIONS & LEAD QUALIFICATION (Part 6.8)                   */}
      {/* ===================================================================== */}
      {activeTab === "extractions" && (
        <div className="bg-white border border-[#E8EAF1] rounded-xl p-6 space-y-5 text-xs">
          <div>
            <h2 className="text-base font-bold text-[#20243A]">
              Tab 7: Extractions & Lead Qualification
            </h2>
            <p className="text-[#747B91]">
              Configure post-call extraction fields, data types, required/optional flags, and structured qualification criteria.
            </p>
          </div>

          {/* Qualification Criteria & Lead Qualification Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl">
            <div className="sm:col-span-2">
              <label className="block font-bold text-[#20243A] mb-1">
                Structured Qualification Criteria
              </label>
              <textarea
                rows={2}
                value={formData.qualificationCriteriaText}
                onChange={(e) =>
                  updateField({ qualificationCriteriaText: e.target.value })
                }
                placeholder="One criterion per line (e.g. Verified budget, Decision maker, Timeline < 90 days)"
                className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Target Lead Qualification Status
                </label>
                <select
                  value={formData.defaultQualificationStatus}
                  onChange={(e) =>
                    updateField({ defaultQualificationStatus: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg"
                >
                  <option value="qualified">Qualified</option>
                  <option value="follow_up_required">Follow-up Required</option>
                  <option value="pending_qualification">
                    Pending Qualification
                  </option>
                  <option value="unqualified">Unqualified</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#20243A]">
                  Qualification Threshold Score: {formData.thresholdScore}%
                </label>
                <input
                  type="range"
                  min={40}
                  max={95}
                  step={5}
                  value={formData.thresholdScore}
                  onChange={(e) =>
                    updateField({ thresholdScore: Number(e.target.value) })
                  }
                  className="w-full accent-[#635BFF]"
                />
              </div>
            </div>
          </div>

          {/* Configured Extraction Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {formData.extractionFields.map((field, idx) => (
              <div
                key={field.key}
                className="p-3.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl flex items-start justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-[#20243A]">
                      {field.label}
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 bg-white border border-[#E8EAF1] rounded text-[#635BFF]">
                      {field.key}
                    </span>
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#EEF0FF] text-[#635BFF] font-semibold">
                      {field.type}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...formData.extractionFields];
                        next[idx] = {
                          ...next[idx],
                          required: !next[idx].required,
                        };
                        updateField({ extractionFields: next });
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        field.required
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {field.required ? "Required" : "Optional"}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#747B91]">
                    {field.description || "Extracted from conversation"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateField({
                      extractionFields: formData.extractionFields.filter(
                        (_, i) => i !== idx
                      ),
                    })
                  }
                  className="text-rose-600 font-bold text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Add Custom Extraction Field Form */}
          <div className="p-4 bg-[#F7F8FC] border border-[#E8EAF1] rounded-xl space-y-3">
            <h3 className="font-bold text-[#20243A]">
              + Add Custom Extraction Field
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#747B91] mb-1">
                  Extraction Field Name
                </label>
                <input
                  type="text"
                  value={newExtractionLabel}
                  onChange={(e) => {
                    setNewExtractionLabel(e.target.value);
                    setNewExtractionKey(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "_")
                        .replace(/^_|_$/g, "")
                    );
                  }}
                  placeholder="e.g. Preferred Doctor"
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#747B91] mb-1">
                  Data Type
                </label>
                <select
                  value={newExtractionType}
                  onChange={(e) =>
                    setNewExtractionType(e.target.value as any)
                  }
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg"
                >
                  <option value="string">String (Text)</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean (Yes/No)</option>
                  <option value="enum">Enum (Status Option)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-[#747B91] mb-1">
                  Extraction Description
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newExtractionDesc}
                    onChange={(e) => setNewExtractionDesc(e.target.value)}
                    placeholder="Instructions on what value to extract..."
                    className="flex-1 px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg"
                  />
                  <label className="flex items-center gap-1 cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={newExtractionRequired}
                      onChange={(e) =>
                        setNewExtractionRequired(e.target.checked)
                      }
                      className="accent-[#635BFF]"
                    />
                    <span>Required</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        !newExtractionKey.trim() ||
                        !newExtractionLabel.trim()
                      )
                        return;
                      updateField({
                        extractionFields: [
                          ...formData.extractionFields,
                          {
                            key: newExtractionKey.trim(),
                            label: newExtractionLabel.trim(),
                            type: newExtractionType,
                            description:
                              newExtractionDesc.trim() ||
                              `Extract ${newExtractionLabel.trim()}`,
                            required: newExtractionRequired,
                          },
                        ],
                      });
                      setNewExtractionKey("");
                      setNewExtractionLabel("");
                      setNewExtractionDesc("");
                      setNewExtractionRequired(false);
                    }}
                    className="px-3.5 py-2 bg-[#635BFF] text-white rounded-lg font-semibold"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sample Extraction Output Preview & AI Extraction Helper */}
          <div className="pt-4 border-t border-[#E8EAF1] grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-[#20243A]">
                  Sample Extraction Output Format
                </h3>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Example JSON
                </span>
              </div>
              <pre className="p-3 rounded-lg bg-[#20243A] text-emerald-300 text-[11px] font-mono overflow-x-auto leading-relaxed">
                {buildLiveSampleExtractionJson()}
              </pre>
            </div>
            <div className="p-4 rounded-xl bg-[#EEF0FF]/60 border border-[#C7CBFF] flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-xs font-bold text-[#20243A]">
                  AI Extraction Instruction Helper
                </h3>
                <p className="text-[11px] text-[#747B91] mt-1">
                  Replace your extraction schema with fields tailored to <strong>{formData.industry || "your industry"}</strong> ({formData.businessObjective || "Lead Qualification"}) so post-call summaries and qualification stay accurate.
                </p>
              </div>
              <button
                type="button"
                disabled={extractionHelperLoading}
                onClick={() => {
                  setExtractionHelperLoading(true);
                  const recommended = getRecommendedExtractionSchema();
                  updateField({ extractionFields: recommended, extractionsEnabled: true });
                  setTimeout(() => setExtractionHelperLoading(false), 250);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-semibold transition"
              >
                {extractionHelperLoading ? "Applying Tailored Schema..." : "Generate Recommended Extraction Schema"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-0 z-20 mt-6 -mx-4 sm:-mx-6 bg-white/95 backdrop-blur border-t border-[#E8EAF1] px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <Link
          href="/agents"
          className="text-xs font-semibold text-[#747B91] hover:text-[#20243A]"
        >
          ← Back to Agents
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSaveAgent({ asDraft: true })}
            className="px-4 py-2.5 rounded-xl bg-[#F7F8FC] border border-[#E8EAF1] hover:border-[#635BFF] text-[#20243A] text-xs font-semibold"
          >
            Save Draft
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleSaveAgent({ asDraft: false })}
            className="px-5 py-2.5 rounded-xl bg-[#635BFF] hover:bg-[#5046E5] text-white text-xs font-bold shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {loading && <ButtonSpinner />}
            <span>
              {loading
                ? "Synchronizing with Voice AI Engine..."
                : isEditMode
                ? "Save & Sync Agent Updates"
                : "Publish & Sync with Voice AI Engine"}
            </span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() =>
              handleSaveAgent({ asDraft: false, launchTestAfter: true })
            }
            className="px-4 py-2.5 rounded-xl bg-white border border-[#C7CBFF] text-[#635BFF] hover:bg-[#EEF0FF] text-xs font-bold"
          >
            📞 Save & Test Call
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* AI PROMPT ASSISTANT – GEMINI MODAL (PART 5)                           */}
      {/* ===================================================================== */}
      {showPromptAssistant && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8EAF1] rounded-2xl max-w-4xl w-full p-6 space-y-4 shadow-xl max-h-[92vh] overflow-y-auto text-xs">
            <div className="flex items-start justify-between border-b border-[#E8EAF1] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#20243A]">
                  ✨ AI Prompt Assistant – Gemini (Google AI Studio Free Tier)
                </h3>
                <p className="text-[#747B91] mt-0.5">
                  Uses an external AI provider (Google Gemini API Free Tier). Only sanitized agent configuration is sent—never customer phone numbers, lead datasets, or recordings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPromptAssistant(false)}
                className="text-sm font-bold text-[#747B91] hover:text-[#20243A]"
              >
                ✕
              </button>
            </div>

            {!geminiConfigured && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-2">
                <p className="font-bold">
                  Gemini API key is not configured (`GEMINI_API_KEY`)
                </p>
                <p className="text-[11px]">
                  An administrator must configure <code>GEMINI_API_KEY</code> in{" "}
                  <code>.env.local</code> using a free-tier API key from{" "}
                  <a
                    href="https://aistudio.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-bold text-[#635BFF]"
                  >
                    Google AI Studio (https://aistudio.google.com/)
                  </a>
                  .
                </p>
              </div>
            )}

            {/* 10 Gemini Actions + Language + Style + Free-Tier Model Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#F7F8FC] p-3.5 rounded-xl border border-[#E8EAF1]">
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block font-semibold text-[#20243A] mb-1">
                  Prompt Language / Script
                </label>
                <select
                  value={promptLanguage}
                  onChange={(e) => setPromptLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg font-semibold text-[#20243A]"
                >
                  <option value="English">English</option>
                  <option value="Hindi (Devanagari — हिंदी)">Hindi (Devanagari — हिंदी)</option>
                  <option value="Hindi (Romanized / Hinglish)">Hindi (Romanized / Hinglish)</option>
                  <option value="Bilingual (English + Hindi)">Bilingual (English + Hindi)</option>
                </select>
              </div>

              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block font-semibold text-[#20243A] mb-1">
                  Prompt Style / Mode Preset
                </label>
                <select
                  value={promptStyle}
                  onChange={(e) => setPromptStyle(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg font-semibold text-[#20243A]"
                >
                  <option value="Consultative Sales">Consultative Sales</option>
                  <option value="Short & Crisp">Short &amp; Crisp</option>
                  <option value="Friendly Support">Friendly Support</option>
                  <option value="Appointment Setter">Appointment Setter</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-[#20243A] mb-1">
                  Select AI Assistant Feature (All 10 Supported)
                </label>
                <select
                  value={promptAction}
                  onChange={(e) => setPromptAction(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg font-semibold text-[#20243A]"
                >
                  <option value="generate_new_prompt">
                    1. Generate New Prompt
                  </option>
                  <option value="improve_existing_prompt">
                    2. Improve Existing Prompt
                  </option>
                  <option value="make_prompt_professional">
                    3. Make Prompt More Professional
                  </option>
                  <option value="simplify_prompt">4. Simplify Prompt</option>
                  <option value="translate_prompt">5. Translate Prompt</option>
                  <option value="regenerate_prompt">6. Regenerate Prompt</option>
                  <option value="generate_greeting_message">
                    7. Generate Greeting Message
                  </option>
                  <option value="generate_fallback_responses">
                    8. Generate Fallback Responses
                  </option>
                  <option value="generate_qualification_questions">
                    9. Generate Qualification Questions
                  </option>
                  <option value="generate_objection_handling">
                    10. Generate Objection Handling Instructions
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Verified Free-Tier Model
                </label>
                <select
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E8EAF1] rounded-lg font-mono"
                >
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gemini-2.5-flash-lite">
                    gemini-2.5-flash-lite
                  </option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                </select>
              </div>
            </div>

            {/* 13 Prefilled Input Fields (Part 5.4) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={assistantInputs.agentName}
                  onChange={(e) =>
                    setAssistantInputs({
                      ...assistantInputs,
                      agentName: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Industry
                </label>
                <input
                  type="text"
                  value={assistantInputs.industry}
                  onChange={(e) =>
                    setAssistantInputs({
                      ...assistantInputs,
                      industry: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Business Objective
                </label>
                <input
                  type="text"
                  value={assistantInputs.businessObjective}
                  onChange={(e) =>
                    setAssistantInputs({
                      ...assistantInputs,
                      businessObjective: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Agent Personality
                </label>
                <select
                  value={assistantInputs.agentPersonality}
                  onChange={(e) =>
                    setAssistantInputs({
                      ...assistantInputs,
                      agentPersonality: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg font-semibold text-[#20243A]"
                >
                  <option value="Professional & Friendly">Professional &amp; Friendly</option>
                  <option value="Warm & Consultative">Warm &amp; Consultative</option>
                  <option value="Professional & Formal">Professional &amp; Formal</option>
                  <option value="Persuasive & Sales-oriented">Persuasive &amp; Sales-oriented</option>
                  <option value="Empathetic & Supportive">Empathetic &amp; Supportive</option>
                  <option value="Casual & Conversational">Casual &amp; Conversational</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Target Audience
                </label>
                <input
                  type="text"
                  value={assistantInputs.targetAudience}
                  onChange={(e) =>
                    setAssistantInputs({
                      ...assistantInputs,
                      targetAudience: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#20243A] mb-1">
                  Primary Language
                </label>
                <select
                  value={assistantInputs.primaryLanguage}
                  onChange={(e) =>
                    setAssistantInputs({
                      ...assistantInputs,
                      primaryLanguage: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg font-semibold text-[#20243A]"
                >
                  <option value="English + Hindi">English + Hindi (Bilingual Hinglish)</option>
                  <option value="Hindi">Hindi (हिंदी - Spoken)</option>
                  <option value="English">English (Indian/Global)</option>
                  <option value="Bengali">Bengali</option>
                  <option value="Marathi">Marathi</option>
                  <option value="Tamil">Tamil</option>
                  <option value="Telugu">Telugu</option>
                  <option value="Kannada">Kannada</option>
                  <option value="Gujarati">Gujarati</option>
                  <option value="Malayalam">Malayalam</option>
                  <option value="Punjabi">Punjabi</option>
                </select>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-[#747B91]">Supported:</span>
                  {(assistantInputs.supportedLanguages || []).map((l) => (
                    <span
                      key={l}
                      className="px-1.5 py-0.5 bg-white border border-[#E8EAF1] text-[10px] rounded font-medium text-[#20243A]"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </div>
              <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Business Description & Conversation Goals
                  </label>
                  <textarea
                    rows={2}
                    value={assistantInputs.businessDescription}
                    onChange={(e) =>
                      setAssistantInputs({
                        ...assistantInputs,
                        businessDescription: e.target.value,
                      })
                    }
                    placeholder="Describe your product/service and primary conversation goals..."
                    className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#20243A] mb-1">
                    Required Questions, Qualification & Objection Handling
                  </label>
                  <textarea
                    rows={2}
                    value={assistantInputs.requiredQuestions}
                    onChange={(e) =>
                      setAssistantInputs({
                        ...assistantInputs,
                        requiredQuestions: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Quick Action Trigger Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={geminiRunning}
                onClick={() => handleRunGeminiAssistant(promptAction, "all")}
                className="px-4 py-2 bg-[#635BFF] hover:bg-[#5046E5] text-white rounded-lg font-bold disabled:opacity-50"
              >
                {geminiRunning
                  ? "Generating via Google Gemini..."
                  : "✨ Run Selected Gemini Action"}
              </button>
              <button
                type="button"
                disabled={geminiRunning}
                onClick={() =>
                  handleRunGeminiAssistant(
                    "generate_new_prompt",
                    "all",
                    "Hindi (Devanagari — हिंदी)"
                  )
                }
                className="px-3.5 py-2 bg-orange-50 text-[#FF671F] border border-orange-200 rounded-lg font-bold hover:bg-[#FF671F] hover:text-white transition-colors"
              >
                🇮🇳 Generate in Hindi (हिंदी)
              </button>
              <button
                type="button"
                disabled={geminiRunning}
                onClick={() =>
                  handleRunGeminiAssistant(
                    "generate_new_prompt",
                    "all",
                    "Hindi (Romanized / Hinglish)"
                  )
                }
                className="px-3.5 py-2 bg-emerald-50 text-[#00C853] border border-emerald-200 rounded-lg font-bold hover:bg-[#00C853] hover:text-white transition-colors"
              >
                🇮🇳 Generate in Hinglish
              </button>
              <button
                type="button"
                disabled={geminiRunning}
                onClick={() =>
                  handleRunGeminiAssistant("improve_existing_prompt", "all")
                }
                className="px-3.5 py-2 bg-[#EEF0FF] text-[#635BFF] border border-[#C7CBFF] rounded-lg font-semibold"
              >
                Improve Existing
              </button>
              <button
                type="button"
                disabled={geminiRunning}
                onClick={() =>
                  handleRunGeminiAssistant("make_prompt_professional", "all")
                }
                className="px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] text-[#20243A] rounded-lg font-semibold"
              >
                Make Professional
              </button>
              <button
                type="button"
                disabled={geminiRunning}
                onClick={() =>
                  handleRunGeminiAssistant("simplify_prompt", "all")
                }
                className="px-3.5 py-2 bg-[#F7F8FC] border border-[#E8EAF1] text-[#20243A] rounded-lg font-semibold"
              >
                Simplify
              </button>
            </div>

            {geminiError && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 space-y-2">
                <p className="font-bold">{geminiError}</p>
                {geminiSetupSteps.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-[11px]">
                    {geminiSetupSteps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* 7 Editable Generated Output Sections with Per-Section Regenerate (Part 5.5) */}
            <div className="space-y-3 pt-2 border-t border-[#E8EAF1]">
              <h4 className="font-bold text-[#20243A]">
                Preview & Edit Generated Output Sections (Confirm before applying)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#20243A]">
                      1. System Prompt
                    </label>
                    <button
                      type="button"
                      disabled={geminiRunning}
                      onClick={() =>
                        handleRunGeminiAssistant(
                          "regenerate_prompt",
                          "systemPrompt"
                        )
                      }
                      className="text-[11px] text-[#635BFF] font-semibold hover:underline"
                    >
                      ↻ Regenerate Section
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={generatedSections.systemPrompt}
                    onChange={(e) =>
                      setGeneratedSections({
                        ...generatedSections,
                        systemPrompt: e.target.value,
                      })
                    }
                    placeholder="Generated System Prompt will appear here..."
                    className="w-full px-3 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#20243A]">
                      2. Greeting Message
                    </label>
                    <button
                      type="button"
                      disabled={geminiRunning}
                      onClick={() =>
                        handleRunGeminiAssistant(
                          "generate_greeting_message",
                          "greetingMessage"
                        )
                      }
                      className="text-[11px] text-[#635BFF] font-semibold hover:underline"
                    >
                      ↻ Regenerate
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={generatedSections.greetingMessage}
                    onChange={(e) =>
                      setGeneratedSections({
                        ...generatedSections,
                        greetingMessage: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#20243A]">
                      3. Conversation Instructions
                    </label>
                    <button
                      type="button"
                      disabled={geminiRunning}
                      onClick={() =>
                        handleRunGeminiAssistant(
                          "simplify_prompt",
                          "conversationInstructions"
                        )
                      }
                      className="text-[11px] text-[#635BFF] font-semibold hover:underline"
                    >
                      ↻ Regenerate
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={generatedSections.conversationInstructions}
                    onChange={(e) =>
                      setGeneratedSections({
                        ...generatedSections,
                        conversationInstructions: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#20243A]">
                      4. Fallback Responses
                    </label>
                    <button
                      type="button"
                      disabled={geminiRunning}
                      onClick={() =>
                        handleRunGeminiAssistant(
                          "generate_fallback_responses",
                          "fallbackResponses"
                        )
                      }
                      className="text-[11px] text-[#635BFF] font-semibold hover:underline"
                    >
                      ↻ Regenerate
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={generatedSections.fallbackResponses}
                    onChange={(e) =>
                      setGeneratedSections({
                        ...generatedSections,
                        fallbackResponses: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#20243A]">
                      5. Qualification Questions
                    </label>
                    <button
                      type="button"
                      disabled={geminiRunning}
                      onClick={() =>
                        handleRunGeminiAssistant(
                          "generate_qualification_questions",
                          "qualificationQuestions"
                        )
                      }
                      className="text-[11px] text-[#635BFF] font-semibold hover:underline"
                    >
                      ↻ Regenerate
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={generatedSections.qualificationQuestions}
                    onChange={(e) =>
                      setGeneratedSections({
                        ...generatedSections,
                        qualificationQuestions: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#20243A]">
                      6. Objection Handling
                    </label>
                    <button
                      type="button"
                      disabled={geminiRunning}
                      onClick={() =>
                        handleRunGeminiAssistant(
                          "generate_objection_handling",
                          "objectionHandling"
                        )
                      }
                      className="text-[11px] text-[#635BFF] font-semibold hover:underline"
                    >
                      ↻ Regenerate
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={generatedSections.objectionHandling}
                    onChange={(e) =>
                      setGeneratedSections({
                        ...generatedSections,
                        objectionHandling: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#20243A]">
                      7. Conversation Closing
                    </label>
                    <button
                      type="button"
                      disabled={geminiRunning}
                      onClick={() =>
                        handleRunGeminiAssistant(
                          "regenerate_prompt",
                          "conversationClosing"
                        )
                      }
                      className="text-[11px] text-[#635BFF] font-semibold hover:underline"
                    >
                      ↻ Regenerate
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={generatedSections.conversationClosing}
                    onChange={(e) =>
                      setGeneratedSections({
                        ...generatedSections,
                        conversationClosing: e.target.value,
                      })
                    }
                    className="w-full px-3 py-1.5 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#E8EAF1]">
              <button
                type="button"
                disabled={!generatedSections.systemPrompt}
                onClick={() => {
                  const formattedText = [
                    `=== SYSTEM PROMPT ===\n${generatedSections.systemPrompt}`,
                    `=== GREETING MESSAGE ===\n${generatedSections.greetingMessage}`,
                    `=== CONVERSATION INSTRUCTIONS ===\n${generatedSections.conversationInstructions}`,
                    `=== FALLBACK RESPONSES ===\n${generatedSections.fallbackResponses}`,
                    `=== QUALIFICATION QUESTIONS ===\n${generatedSections.qualificationQuestions}`,
                    `=== OBJECTION HANDLING ===\n${generatedSections.objectionHandling}`,
                    `=== CONVERSATION CLOSING ===\n${generatedSections.conversationClosing}`,
                  ]
                    .filter((block) => !block.endsWith("\n"))
                    .join("\n\n");
                  navigator.clipboard.writeText(formattedText);
                  setCopiedGenerated(true);
                  setTimeout(() => setCopiedGenerated(false), 2000);
                }}
                className="px-4 py-2 bg-[#F7F8FC] border border-[#E8EAF1] rounded-lg font-semibold text-[#20243A] disabled:opacity-40"
              >
                {copiedGenerated ? "Copied Formatted Prompt!" : "Copy Formatted Prompt"}
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPromptAssistant(false)}
                  className="px-4 py-2 border border-[#E8EAF1] rounded-lg font-semibold text-[#747B91]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!generatedSections.systemPrompt.trim()}
                  onClick={() => setConfirmApplyModal(true)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold disabled:opacity-40"
                >
                  Apply to Editor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal Before Applying Generated Prompt (Part 5.5) */}
      {confirmApplyModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8EAF1] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl text-xs">
            <h3 className="text-base font-bold text-[#20243A]">
              Confirm Applying Gemini Output to Agent Studio
            </h3>
            <p className="text-[#747B91] leading-relaxed">
              This will replace the current System Prompt, Greeting Message, Conversation Instructions, and Fallback Response in your editor with the reviewed Gemini output.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmApplyModal(false)}
                className="px-4 py-2 border border-[#E8EAF1] rounded-lg font-semibold text-[#747B91]"
              >
                Back to Preview
              </button>
              <button
                type="button"
                onClick={handleConfirmApplyGeneratedToStudio}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold"
              >
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
