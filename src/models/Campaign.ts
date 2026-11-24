import mongoose, { Document, Schema, Model } from "mongoose";

export interface ICampaignDoc extends Document {
  organizationId: any;
  name: string;
  description?: string;
  objective?: string;
  campaignType?: string;
  direction?: "inbound" | "outbound" | "both";
  agentId: string;
  agentName?: string;
  outboundPhoneNumber?: string;
  maxCallDurationSeconds?: number;
  leadIds: string[];
  uploadedFileName?: string;
  columnMapping?: Record<string, any>;
  validationSummary?: {
    totalUploaded: number;
    validRecords: number;
    invalidRecords: number;
    duplicateRecords: number;
    missingPhoneNumbers: number;
    importedRecords: number;
  };
  callQueue?: Array<{
    leadId: string;
    leadName: string;
    phoneNumber: string;
    status: string;
    attempts: number;
    bolnaExecutionId?: string;
    callId?: string;
    lastAttemptAt?: Date;
    qualified?: boolean;
    error?: string;
  }>;
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
    startDate: Date;
    endDate?: Date;
    callingHours: {
      start: string;
      end: string;
    };
    timezone: string;
  };
  maxRetries: number;
  retryIntervalMinutes: number;
  priority: "low" | "medium" | "high";
  status:
    | "draft"
    | "ready"
    | "scheduled"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";
  bolnaBatchId?: string;
  bolnaBatchStatus?: string;
  bolnaSyncStatus?: string;
  bolnaSyncError?: string | null;
  lastSyncedAt?: Date;
  createdBy?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaignDoc>(
  {
    organizationId: { type: Schema.Types.Mixed, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    objective: { type: String, default: "Lead Qualification" },
    campaignType: { type: String, default: "lead_qualification" },
    direction: {
      type: String,
      enum: ["inbound", "outbound", "both"],
      default: "outbound",
    },
    agentId: { type: Schema.Types.Mixed, required: true, index: true },
    agentName: { type: String, default: "AI Voice Agent" },
    outboundPhoneNumber: { type: String, default: "" },
    maxCallDurationSeconds: { type: Number, default: 300 },
    leadIds: [{ type: Schema.Types.Mixed }],
    uploadedFileName: { type: String },
    columnMapping: { type: Schema.Types.Mixed, default: {} },
    validationSummary: {
      totalUploaded: { type: Number, default: 0 },
      validRecords: { type: Number, default: 0 },
      invalidRecords: { type: Number, default: 0 },
      duplicateRecords: { type: Number, default: 0 },
      missingPhoneNumbers: { type: Number, default: 0 },
      importedRecords: { type: Number, default: 0 },
    },
    callQueue: [
      {
        leadId: { type: String },
        leadName: { type: String },
        phoneNumber: { type: String },
        status: { type: String, default: "queued" },
        attempts: { type: Number, default: 0 },
        bolnaExecutionId: { type: String },
        callId: { type: String },
        lastAttemptAt: { type: Date },
        qualified: { type: Boolean, default: false },
        error: { type: String },
      },
    ],
    concurrency: { type: Number, default: 2 },
    startCondition: {
      type: String,
      enum: ["immediate", "scheduled"],
      default: "immediate",
    },
    consentConfirmed: { type: Boolean, default: true },
    totalLeads: { type: Number, default: 0 },
    eligibleLeads: { type: Number, default: 0 },
    queuedLeads: { type: Number, default: 0 },
    callsInitiated: { type: Number, default: 0 },
    callsAcceptedByBolna: { type: Number, default: 0 },
    callsInProgress: { type: Number, default: 0 },
    connectedCalls: { type: Number, default: 0 },
    completedCalls: { type: Number, default: 0 },
    successfulCalls: { type: Number, default: 0 },
    failedCalls: { type: Number, default: 0 },
    noAnswerCalls: { type: Number, default: 0 },
    qualifiedLeads: { type: Number, default: 0 },
    remainingLeads: { type: Number, default: 0 },
    schedule: {
      startDate: { type: Date, default: Date.now },
      endDate: { type: Date },
      callingHours: {
        start: { type: String, default: "09:30" },
        end: { type: String, default: "18:30" },
      },
      timezone: { type: String, default: "Asia/Kolkata" },
    },
    maxRetries: { type: Number, default: 2 },
    retryIntervalMinutes: { type: Number, default: 60 },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    status: {
      type: String,
      enum: [
        "draft",
        "ready",
        "scheduled",
        "running",
        "paused",
        "completed",
        "failed",
        "cancelled",
      ],
      default: "draft",
    },
    bolnaBatchId: { type: String, trim: true, index: true },
    bolnaBatchStatus: { type: String, default: "created" },
    bolnaSyncStatus: { type: String, default: "pending" },
    bolnaSyncError: { type: String, default: null },
    lastSyncedAt: { type: Date },
    createdBy: { type: Schema.Types.Mixed },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

CampaignSchema.index({ organizationId: 1, status: 1 });
CampaignSchema.index({ organizationId: 1, agentId: 1 });

if (mongoose.models.Campaign) {
  delete (mongoose.models as any).Campaign;
}

const Campaign: Model<ICampaignDoc> = mongoose.model<ICampaignDoc>(
  "Campaign",
  CampaignSchema
);

export default Campaign;
