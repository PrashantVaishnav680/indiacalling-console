import mongoose, { Document, Schema, Model } from "mongoose";

export interface IAgentDoc extends Document {
  organizationId: any;
  name: string;
  description?: string;
  businessName?: string;
  industry?: string;
  category?: string;
  businessObjective?: string;
  agentType: "inbound" | "outbound" | "both";
  voiceEngine?: "Cascaded";
  bolnaAgentId?: string;
  bolnaVersionId?: string;
  configVersion: number;
  versionHistory?: Array<{
    version: number;
    savedAt: Date;
    savedBy?: string;
    syncStatus: string;
    bolnaVersionId?: string;
    summary?: string;
    snapshot?: Record<string, any>;
  }>;
  syncStatus: "synced" | "pending" | "syncing" | "failed" | "needs_attention";
  lastSyncedAt?: Date;
  syncError?: string | null;
  testingMode?: "browser_web_call" | "outbound_test_call";
  configuration?: Record<string, any>;
  language: string;
  additionalLanguages?: string[];
  multilingualEnabled?: boolean;
  languageDetectionEnabled?: boolean;
  languageInstructions?: string;
  voiceConfiguration: {
    provider: string;
    voiceId: string;
    voiceName?: string;
    model?: string;
    speed?: number;
    pitch?: number;
    temperature?: number;
    bufferSize?: number;
    audioFormat?: string;
    transcriberProvider?: string;
    transcriberModel?: string;
    samplingRate?: number;
    endpointingMs?: number;
  };
  conversationConfiguration: {
    systemPrompt: string;
    greetingMessage: string;
    personality?: string;
    conversationInstructions?: string;
    businessInfo?: string;
    conversationContext?: string;
    advancedInstructions?: string;
    conversationGoals?: string[];
    qualificationCriteria?: string[];
    closingMessage?: string;
    fallbackMessage?: string;
    llmProvider?: string;
    llmModel?: string;
    maxTokens?: number;
    temperature?: number;
    knowledgeBaseIds?: string[];
  };
  toolsConfiguration?: {
    knowledgeBaseEnabled?: boolean;
    customVariables?: string[];
    webhookUrl?: string;
    appointmentToolEnabled?: boolean;
    appointmentWebhookUrl?: string;
    callTransferEnabled?: boolean;
    callTransferNumber?: string;
    customApiTools?: Array<{
      name: string;
      description: string;
      endpoint: string;
      method: "GET" | "POST";
    }>;
  };
  extractionsConfiguration?: {
    enabled: boolean;
    fields: Array<{
      key: string;
      label: string;
      type: string;
      description?: string;
      required?: boolean;
    }>;
  };
  qualificationConfiguration: {
    requiredFields: string[];
    thresholdScore: number;
    autoAssignSalesperson: boolean;
    callSummaryEnabled?: boolean;
    warmTransferNumber?: string;
    calendarWebhookUrl?: string;
  };
  callingConfiguration: {
    direction: "inbound" | "outbound" | "both";
    inboundEnabled?: boolean;
    outboundEnabled?: boolean;
    phoneNumber?: string;
    telephonyProvider?: string;
    browserTestingEnabled?: boolean;
    callTimeoutSeconds?: number;
    maxDurationSeconds: number;
    maxRetries?: number;
    retryIntervalMinutes?: number;
    hangupAfterSilenceSeconds?: number;
    aiHangupEnabled?: boolean;
    interruptionWords?: number;
    endpointingMs?: number;
    endCallBehavior?: string;
    greetingBehavior?: "agent_speaks_first" | "wait_for_user";
    scheduleTimezone: string;
    allowedCallingHours?: {
      start: string;
      end: string;
    };
  };
  status: "active" | "inactive" | "draft" | "paused";
  metrics?: {
    totalLeads?: number;
    totalCalls: number;
    callsInitiated?: number;
    callsAcceptedByBolna?: number;
    connectedCalls?: number;
    successfulCalls: number;
    failedCalls?: number;
    qualifiedLeads: number;
    conversionRate?: number;
    avgDurationSeconds: number;
    activeCampaigns?: number;
    lastCallDate?: Date;
  };
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AgentSchema = new Schema<IAgentDoc>(
  {
    organizationId: { type: Schema.Types.Mixed, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    businessName: { type: String, default: "" },
    industry: { type: String, default: "General Business" },
    category: { type: String, default: "General Business" },
    businessObjective: { type: String, default: "" },
    agentType: {
      type: String,
      enum: ["inbound", "outbound", "both"],
      required: true,
      default: "outbound",
    },
    voiceEngine: { type: String, default: "Cascaded" },
    bolnaAgentId: { type: String, trim: true, index: true },
    bolnaVersionId: { type: String, trim: true },
    configVersion: { type: Number, default: 1 },
    versionHistory: [
      {
        version: { type: Number },
        savedAt: { type: Date, default: Date.now },
        savedBy: { type: String },
        syncStatus: { type: String },
        bolnaVersionId: { type: String },
        summary: { type: String },
        snapshot: { type: Schema.Types.Mixed },
      },
    ],
    syncStatus: {
      type: String,
      enum: ["synced", "pending", "syncing", "failed", "needs_attention"],
      default: "pending",
      index: true,
    },
    lastSyncedAt: { type: Date },
    syncError: { type: String, default: null },
    testingMode: {
      type: String,
      enum: ["browser_web_call", "outbound_test_call"],
      default: "outbound_test_call",
    },
    configuration: { type: Schema.Types.Mixed, default: {} },
    language: { type: String, default: "English + Hindi" },
    additionalLanguages: [{ type: String }],
    multilingualEnabled: { type: Boolean, default: true },
    languageDetectionEnabled: { type: Boolean, default: true },
    languageInstructions: { type: String, default: "" },
    voiceConfiguration: {
      provider: { type: String, default: "elevenlabs" },
      voiceId: { type: String, default: "1Z7Y8o9cvUeWq8oLKgMY" },
      voiceName: { type: String, default: "Tripti - Calm and Clear" },
      model: { type: String, default: "eleven_turbo_v2_5" },
      speed: { type: Number, default: 1.0 },
      pitch: { type: Number, default: 1.0 },
      temperature: { type: Number, default: 0.5 },
      bufferSize: { type: Number, default: 250 },
      audioFormat: { type: String, default: "wav" },
      transcriberProvider: { type: String, default: "deepgram" },
      transcriberModel: { type: String, default: "nova-2" },
      samplingRate: { type: Number, default: 16000 },
      endpointingMs: { type: Number, default: 250 },
    },
    conversationConfiguration: {
      systemPrompt: { type: String, required: true },
      greetingMessage: { type: String, required: true },
      personality: { type: String, default: "Professional, warm, and consultative" },
      conversationInstructions: { type: String, default: "" },
      businessInfo: { type: String },
      conversationContext: { type: String },
      advancedInstructions: { type: String },
      conversationGoals: [{ type: String }],
      qualificationCriteria: [{ type: String }],
      closingMessage: { type: String },
      fallbackMessage: {
        type: String,
        default: "I apologize, I didn't catch that clearly. Could you please repeat that?",
      },
      llmProvider: { type: String, default: "openai" },
      llmModel: { type: String, default: "gpt-4o-mini" },
      maxTokens: { type: Number, default: 250 },
      temperature: { type: Number, default: 0.2 },
      knowledgeBaseIds: [{ type: String }],
    },
    toolsConfiguration: {
      knowledgeBaseEnabled: { type: Boolean, default: false },
      enabledIntegrations: [{ type: String }],
      crmProvider: { type: String, default: "none" },
      calendarProvider: { type: String, default: "none" },
      customVariables: [{ type: String }],
      webhookUrl: { type: String, default: "" },
      webhookSecret: { type: String, default: "" },
      appointmentToolEnabled: { type: Boolean, default: false },
      appointmentWebhookUrl: { type: String, default: "" },
      callTransferEnabled: { type: Boolean, default: false },
      callTransferNumber: { type: String, default: "" },
      handoffDepartment: { type: String, default: "Sales Desk" },
      customApiTools: [
        {
          name: { type: String },
          description: { type: String },
          endpoint: { type: String },
          method: { type: String, default: "POST" },
        },
      ],
    },
    extractionsConfiguration: {
      enabled: { type: Boolean, default: true },
      fields: [
        {
          key: { type: String },
          label: { type: String },
          type: { type: String, default: "string" },
          description: { type: String },
          required: { type: Boolean, default: false },
        },
      ],
    },
    qualificationConfiguration: {
      requiredFields: [{ type: String }],
      thresholdScore: { type: Number, default: 70 },
      autoAssignSalesperson: { type: Boolean, default: true },
      callSummaryEnabled: { type: Boolean, default: true },
      warmTransferNumber: { type: String },
      calendarWebhookUrl: { type: String },
    },
    callingConfiguration: {
      direction: {
        type: String,
        enum: ["inbound", "outbound", "both"],
        default: "outbound",
      },
      inboundEnabled: { type: Boolean, default: false },
      outboundEnabled: { type: Boolean, default: true },
      phoneNumber: { type: String, default: "" },
      telephonyProvider: { type: String, default: "plivo" },
      browserTestingEnabled: { type: Boolean, default: true },
      callTimeoutSeconds: { type: Number, default: 30 },
      maxDurationSeconds: { type: Number, default: 300 },
      maxRetries: { type: Number, default: 2 },
      retryIntervalMinutes: { type: Number, default: 60 },
      hangupAfterSilenceSeconds: { type: Number, default: 12 },
      aiHangupEnabled: { type: Boolean, default: true },
      interruptionWords: { type: Number, default: 2 },
      endpointingMs: { type: Number, default: 250 },
      endCallBehavior: {
        type: String,
        default: "Thank the caller politely and disconnect after summary",
      },
      greetingBehavior: {
        type: String,
        enum: ["agent_speaks_first", "wait_for_user"],
        default: "agent_speaks_first",
      },
      scheduleTimezone: { type: String, default: "Asia/Kolkata" },
      allowedCallingHours: {
        start: { type: String, default: "09:30" },
        end: { type: String, default: "18:30" },
      },
    },
    status: {
      type: String,
      enum: ["active", "inactive", "draft", "paused"],
      default: "active",
    },
    metrics: {
      totalLeads: { type: Number, default: 0 },
      totalCalls: { type: Number, default: 0 },
      callsInitiated: { type: Number, default: 0 },
      callsAcceptedByBolna: { type: Number, default: 0 },
      connectedCalls: { type: Number, default: 0 },
      successfulCalls: { type: Number, default: 0 },
      failedCalls: { type: Number, default: 0 },
      qualifiedLeads: { type: Number, default: 0 },
      conversionRate: { type: Number, default: 0 },
      avgDurationSeconds: { type: Number, default: 0 },
      activeCampaigns: { type: Number, default: 0 },
      lastCallDate: { type: Date },
    },
    createdBy: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

AgentSchema.index({ organizationId: 1, status: 1 });
AgentSchema.index({ organizationId: 1, bolnaAgentId: 1 }, { sparse: true });

if (mongoose.models.Agent) {
  delete (mongoose.models as any).Agent;
}

const Agent: Model<IAgentDoc> = mongoose.model<IAgentDoc>("Agent", AgentSchema);

export default Agent;
