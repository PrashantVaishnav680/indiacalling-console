export type UserRole =
  | "super_admin"
  | "organization"
  | "client_admin"
  | "sales_manager"
  | "sales_rep"
  | "salesperson";

/**
 * Strict 2-Role Architecture:
 * - "super_admin": Platform-level administrator (Zero-PII metadata only)
 * - "organization": Tenant workspace user (full operational portal)
 */
export type CanonicalUserRole = "super_admin" | "organization";

export function normalizeUserRole(role?: string | null): CanonicalUserRole {
  const r = String(role || "organization").toLowerCase().trim();
  if (r === "super_admin" || r === "superadmin" || r === "super admin") {
    return "super_admin";
  }
  return "organization";
}

export function getRoleDisplayLabel(
  role?: string | null
): "Super Admin" | "Organization" {
  return normalizeUserRole(role) === "super_admin"
    ? "Super Admin"
    : "Organization";
}

export type BolnaSyncStatus =
  | "synced"
  | "pending"
  | "syncing"
  | "failed"
  | "needs_attention";

export type TestingMode = "browser_web_call" | "outbound_test_call";

export interface IUser {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string;
  workspaceName?: string;
  sector?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface IOrganization {
  _id: string;
  name: string;
  slug: string;
  email: string;
  phone?: string;
  address?: string;
  industry?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  status: "active" | "suspended" | "pending" | "inactive";
  settings: {
    callingHours?: {
      start: string;
      end: string;
      timezone: string;
    };
    maxConcurrentCalls?: number;
    maxAgents?: number;
    monthlyCallLimit?: number;
    defaultLanguage?: string;
    webhookUrl?: string;
  };
  billing?: {
    planName?: string;
    balanceInr?: number;
    ratePerMinuteInr?: number;
    unbilledInr?: number;
    dueInr?: number;
    invoices?: IBillingInvoice[];
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type KnowledgeDocumentStatus =
  | "uploaded"
  | "processing"
  | "ready"
  | "failed";

export interface IKnowledgeDocument {
  _id: string;
  fileName: string;
  fileType: "pdf" | "txt" | "docx" | "csv";
  fileSizeBytes: number;
  extractedText: string;
  chunks: string[];
  rowCount?: number;
  processingStatus: KnowledgeDocumentStatus;
  errorMessage?: string;
  uploadedAt: Date | string;
}

export interface IKnowledgeBase {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  languageSupport?: string;
  sourceType?: "pdf" | "url" | "manual";
  sourceUrl?: string;
  category:
    | "Company Information"
    | "Product Information"
    | "Pricing & Plans"
    | "Sales Playbooks"
    | "FAQs"
    | "Appointment Rules"
    | "Customer Support"
    | "Custom"
    | string;
  status: "active" | "inactive";
  processingStatus: KnowledgeDocumentStatus;
  documents: IKnowledgeDocument[];
  documentCount: number;
  totalChunks?: number;
  associatedAgentIds?: string[];
  bolnaRagId?: string;
  bolnaSyncStatus?: BolnaSyncStatus;
  bolnaSyncError?: string | null;
  lastSyncedAt?: Date | string;
  createdBy?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type AgentType = "inbound" | "outbound" | "both";
export type AgentStatus = "active" | "inactive" | "draft" | "paused";

export interface IAgentExtractionField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "enum";
  description?: string;
  required?: boolean;
}

export interface IAgentVersionSnapshot {
  version: number;
  savedAt: Date | string;
  savedBy?: string;
  syncStatus: BolnaSyncStatus;
  bolnaVersionId?: string;
  summary?: string;
  snapshot?: Record<string, any>;
}

export interface IAgentComputedMetrics {
  totalLeads: number;
  totalCalls: number;
  callsInitiated: number;
  callsAcceptedByBolna: number;
  connectedCalls: number;
  successfulCalls: number;
  failedCalls: number;
  qualifiedLeads: number;
  conversionRate: number;
  avgDurationSeconds: number;
  activeCampaigns: number;
  lastCallDate?: Date | string | null;
}

export interface IAgent {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  businessName?: string;
  industry?: string;
  category?: string;
  businessObjective?: string;
  agentType: AgentType;
  voiceEngine?: "Cascaded";
  bolnaAgentId?: string;
  bolnaVersionId?: string;
  configVersion?: number;
  versionHistory?: IAgentVersionSnapshot[];
  syncStatus?: BolnaSyncStatus;
  lastSyncedAt?: Date | string;
  syncError?: string | null;
  testingMode?: TestingMode;
  configuration?: Record<string, any>;
  language: string;
  defaultLanguage?: string;
  additionalLanguages?: string[];
  multilingualEnabled?: boolean;
  languageDetectionEnabled?: boolean;
  languageInstructions?: string;
  voiceConfiguration: {
    provider: string;
    voiceId: string;
    voiceName?: string;
    model?: string;
    language?: string;
    speed?: number;
    stability?: number;
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
    enabledIntegrations?: string[];
    crmProvider?: string;
    calendarProvider?: string;
    customVariables?: string[];
    webhookUrl?: string;
    webhookSecret?: string;
    appointmentToolEnabled?: boolean;
    appointmentWebhookUrl?: string;
    callTransferEnabled?: boolean;
    callTransferNumber?: string;
    handoffDepartment?: string;
    customApiTools?: Array<{
      name: string;
      description: string;
      endpoint: string;
      method: "GET" | "POST";
    }>;
  };
  extractionsConfiguration?: {
    enabled: boolean;
    fields: IAgentExtractionField[];
  };
  qualificationConfiguration: {
    requiredFields: string[];
    thresholdScore: number;
    defaultQualificationStatus?: string;
    autoAssignSalesperson: boolean;
    callSummaryEnabled?: boolean;
    warmTransferNumber?: string;
    calendarWebhookUrl?: string;
  };
  callingConfiguration: {
    direction: AgentType;
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
    allowedDays?: string[];
    allowedCallingHours?: {
      start: string;
      end: string;
    };
  };
  status: AgentStatus;
  metrics?: IAgentComputedMetrics;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type CampaignStatus =
  | "draft"
  | "ready"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface ICampaignQueueItem {
  leadId: string;
  leadName: string;
  phoneNumber: string;
  status:
    | "queued"
    | "initiated"
    | "accepted_by_bolna"
    | "in_progress"
    | "connected"
    | "completed"
    | "failed"
    | "no_answer"
    | "cancelled";
  attempts: number;
  bolnaExecutionId?: string;
  callId?: string;
  lastAttemptAt?: Date | string;
  qualified?: boolean;
  error?: string;
}

export interface ICampaignValidationSummary {
  totalUploaded: number;
  validRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
  missingPhoneNumbers: number;
  importedRecords: number;
}

export interface ICampaign {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  objective?: string;
  campaignType?: string;
  direction?: AgentType;
  agentId: string;
  agentName?: string;
  outboundPhoneNumber?: string;
  maxCallDurationSeconds?: number;
  leadIds: string[];
  uploadedFileName?: string;
  columnMapping?: Record<string, any>;
  validationSummary?: ICampaignValidationSummary;
  callQueue?: ICampaignQueueItem[];
  concurrency?: number;
  startCondition?: "immediate" | "scheduled";
  consentConfirmed?: boolean;
  totalLeads: number;
  eligibleLeads?: number;
  queuedLeads?: number;
  callsInitiated?: number;
  callsAcceptedByBolna?: number;
  callsInProgress?: number;
  connectedCalls?: number;
  completedCalls: number;
  successfulCalls: number;
  failedCalls?: number;
  noAnswerCalls?: number;
  qualifiedLeads: number;
  remainingLeads?: number;
  schedule: {
    startDate: Date | string;
    endDate?: Date | string;
    callingHours: {
      start: string;
      end: string;
    };
    timezone: string;
  };
  maxRetries: number;
  retryIntervalMinutes: number;
  priority: "low" | "medium" | "high";
  status: CampaignStatus;
  bolnaBatchId?: string;
  bolnaBatchStatus?: string;
  bolnaSyncStatus?: BolnaSyncStatus;
  bolnaSyncError?: string | null;
  lastSyncedAt?: Date | string;
  startedAt?: Date | string;
  completedAt?: Date | string;
  createdBy: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type QualificationStatus =
  | "new"
  | "pending_qualification"
  | "qualified"
  | "unqualified"
  | "assigned"
  | "contacted"
  | "follow_up_required"
  | "converted"
  | "lost"
  | "do_not_contact";

export type InterestLevel = "high" | "medium" | "low" | "unknown";

export interface ILead {
  _id: string;
  organizationId: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  location?: string;
  city?: string;
  budget?: string;
  industry?: string;
  source: string;
  campaignId?: string;
  assignedAgentId?: string;
  assignedSalespersonId?: string;
  assignedSalespersonName?: string;
  customFields?: Record<string, any>;
  extractedInfo?: Record<string, any>;
  qualificationStatus: QualificationStatus;
  interestLevel: InterestLevel;
  qualificationScore?: number;
  qualificationReason?: string;
  lastCallId?: string;
  lastCallDate?: Date | string;
  followUpAt?: Date | string;
  scheduledCall?: {
    scheduledAt: Date | string;
    timezone?: string;
    notes?: string;
    status: "scheduled" | "completed" | "missed" | "cancelled";
    assignedToId?: string;
    assignedToName?: string;
    updatedAt?: Date | string;
  };
  qualificationSignals?: string[];
  totalCalls?: number;
  lastAgentName?: string;
  lastCallOutcome?: string;
  lastCallScore?: number;
  doNotContact: boolean;
  notes?: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type CallDirection = "inbound" | "outbound" | "web_call";

export type CallStatus =
  | "queued"
  | "initiated"
  | "ringing"
  | "answered"
  | "in_progress"
  | "completed"
  | "no_answer"
  | "busy"
  | "failed"
  | "cancelled";

export interface ICall {
  _id: string;
  organizationId: string;
  bolnaExecutionId?: string;
  bolnaCallId?: string;
  agentId: string;
  bolnaAgentId?: string;
  agentName: string;
  leadId?: string;
  leadName?: string;
  campaignId?: string;
  campaignName?: string;
  assignedSalespersonId?: string;
  assignedSalespersonName?: string;
  direction: CallDirection;
  callDirection?: CallDirection;
  status: CallStatus;
  callStatus?: CallStatus;
  acceptedByBolna?: boolean;
  connected?: boolean;
  phoneNumber: string;
  durationSeconds: number;
  duration?: number;
  cost?: number;
  transcript?: string;
  callOutcome?: string;
  customerIntent?: string;
  objections?: string[];
  qualificationStatus?: "qualified" | "unqualified" | "pending" | "follow_up";
  isSimulated?: boolean;
  testingMode?: TestingMode;
  syncStatus?: BolnaSyncStatus;
  lastSyncedAt?: Date | string;
  startedAt?: Date | string;
  endedAt?: Date | string;
  recordingUrl?: string;
  recordingMetadata?: {
    format: string;
    sizeBytes?: number;
    duration?: number;
  };
  qualificationResult?: {
    status: "qualified" | "unqualified" | "pending" | "follow_up";
    score: number;
    interestLevel: InterestLevel;
    reason: string;
    customerIntent?: string;
    objections?: string[];
    budget?: string;
    timeline?: string;
    nextAction?: string;
    extractedRequirements?: string[];
  };
  extractedData?: Record<string, any>;
  callMetadata?: Record<string, any>;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ITranscriptMessage {
  speaker: "agent" | "customer" | "system" | "assistant" | "user";
  text: string;
  timestamp?: string;
  confidence?: number;
}

export interface ITranscript {
  _id: string;
  organizationId: string;
  callId: string;
  bolnaExecutionId?: string;
  agentId: string;
  leadId?: string;
  rawText?: string;
  messages: ITranscriptMessage[];
  summary: string;
  qualificationResult?: ICall["qualificationResult"];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ILeadAssignment {
  _id: string;
  organizationId: string;
  leadId: string;
  leadName: string;
  salespersonId: string;
  salespersonName: string;
  assignedBy: string;
  assignmentMethod: "round_robin" | "least_assigned" | "manual" | "availability";
  status: "pending" | "accepted" | "completed" | "cancelled";
  assignedAt: Date | string;
  acceptedAt?: Date | string;
  completedAt?: Date | string;
  notes?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface INotification {
  _id: string;
  organizationId: string;
  userId: string;
  type:
    | "lead_qualified"
    | "lead_assigned"
    | "call_failed"
    | "campaign_completed"
    | "system_alert";
  title: string;
  message: string;
  referenceId?: string;
  isRead: boolean;
  createdAt: Date | string;
}

export interface IWebhookEvent {
  _id: string;
  eventId: string;
  source: string;
  eventType: string;
  payload: Record<string, any>;
  processed: boolean;
  processedAt?: Date | string;
  error?: string;
  createdAt: Date | string;
}

export interface IBillingInvoice {
  id: string;
  invoiceNumber: string;
  periodLabel: string;
  amountInr: number;
  minutesBilled: number;
  status: "paid" | "due" | "pending";
  issuedAt: string;
  paidAt?: string;
  type: "usage" | "topup" | "plan";
  description?: string;
}
