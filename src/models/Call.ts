import mongoose, { Document, Schema, Model } from "mongoose";

export interface ICallDoc extends Document {
  organizationId: any;
  bolnaExecutionId?: string;
  bolnaCallId?: string;
  agentId: any;
  bolnaAgentId?: string;
  agentName?: string;
  leadId?: any;
  leadName?: string;
  campaignId?: any;
  campaignName?: string;
  direction: "inbound" | "outbound" | "web_call";
  callDirection?: "inbound" | "outbound" | "web_call";
  status:
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
  callStatus?: string;
  phoneNumber: string;
  durationSeconds: number;
  duration?: number;
  cost?: number;
  transcript?: string;
  startedAt?: Date;
  endedAt?: Date;
  recordingUrl?: string;
  callOutcome?: string;
  qualificationStatus?: "qualified" | "unqualified" | "pending";
  isSimulated?: boolean;
  testingMode?: "simulated" | "browser_web_call" | "outbound_test_call";
  syncStatus?: "synced" | "pending" | "syncing" | "failed" | "needs_attention";
  lastSyncedAt?: Date;
  recordingMetadata?: {
    format: string;
    sizeBytes?: number;
    duration?: number;
  };
  qualificationResult?: {
    status: "qualified" | "unqualified" | "pending";
    score: number;
    interestLevel: "high" | "medium" | "low" | "unknown";
    reason: string;
    budget?: string;
    timeline?: string;
    nextAction?: string;
    extractedRequirements?: string[];
  };
  extractedData?: Record<string, any>;
  callMetadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const CallSchema = new Schema<ICallDoc>(
  {
    organizationId: { type: Schema.Types.Mixed, required: true, index: true },
    bolnaExecutionId: { type: String, trim: true, index: true },
    bolnaCallId: { type: String, trim: true, index: true },
    agentId: { type: Schema.Types.Mixed, required: true, index: true },
    bolnaAgentId: { type: String, trim: true, index: true },
    agentName: { type: String, default: "AI Voice Agent" },
    leadId: { type: Schema.Types.Mixed, index: true },
    leadName: { type: String },
    campaignId: { type: Schema.Types.Mixed, index: true },
    campaignName: { type: String },
    direction: {
      type: String,
      enum: ["inbound", "outbound", "web_call"],
      required: true,
      default: "outbound",
    },
    callDirection: {
      type: String,
      enum: ["inbound", "outbound", "web_call"],
      default: "outbound",
    },
    status: {
      type: String,
      enum: [
        "queued",
        "initiated",
        "ringing",
        "answered",
        "in_progress",
        "completed",
        "no_answer",
        "busy",
        "failed",
        "cancelled",
      ],
      required: true,
      default: "initiated",
      index: true,
    },
    callStatus: { type: String, default: "initiated" },
    phoneNumber: { type: String, required: true },
    durationSeconds: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    transcript: { type: String, default: "" },
    startedAt: { type: Date },
    endedAt: { type: Date },
    recordingUrl: { type: String },
    callOutcome: { type: String, default: "" },
    qualificationStatus: {
      type: String,
      enum: ["qualified", "unqualified", "pending"],
      default: "pending",
    },
    isSimulated: { type: Boolean, default: false, index: true },
    testingMode: {
      type: String,
      enum: ["simulated", "browser_web_call", "outbound_test_call"],
    },
    syncStatus: {
      type: String,
      enum: ["synced", "pending", "syncing", "failed", "needs_attention"],
      default: "synced",
    },
    lastSyncedAt: { type: Date },
    recordingMetadata: {
      format: { type: String, default: "audio/wav" },
      sizeBytes: { type: Number },
      duration: { type: Number },
    },
    qualificationResult: {
      status: {
        type: String,
        enum: ["qualified", "unqualified", "pending"],
        default: "pending",
      },
      score: { type: Number, default: 0 },
      interestLevel: {
        type: String,
        enum: ["high", "medium", "low", "unknown"],
        default: "unknown",
      },
      reason: { type: String },
      budget: { type: String },
      timeline: { type: String },
      nextAction: { type: String },
      extractedRequirements: [{ type: String }],
    },
    extractedData: { type: Schema.Types.Mixed, default: {} },
    callMetadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

CallSchema.index({ organizationId: 1, createdAt: -1 });
CallSchema.index({ organizationId: 1, bolnaExecutionId: 1 }, { unique: true, sparse: true });
CallSchema.index({ organizationId: 1, bolnaCallId: 1 }, { sparse: true });

if (mongoose.models.Call) {
  delete (mongoose.models as any).Call;
}

const Call: Model<ICallDoc> = mongoose.model<ICallDoc>("Call", CallSchema);

export default Call;
