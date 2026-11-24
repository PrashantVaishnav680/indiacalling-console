import mongoose, { Document, Schema, Model } from "mongoose";

export interface IScheduledCall {
  scheduledAt: Date;
  timezone: string;
  notes?: string;
  status: "scheduled" | "completed" | "missed" | "cancelled";
  assignedToId?: string;
  assignedToName?: string;
  autoDialWithAi?: boolean;
  agentId?: string;
  agentName?: string;
  bolnaCallId?: string;
  updatedAt: Date;
}

export interface ILeadDoc extends Document {
  organizationId: any;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  location?: string;
  budget?: string;
  timeline?: string;
  industry?: string;
  source: string;
  customFields?: Record<string, any>;
  qualificationStatus:
    | "new"
    | "pending_qualification"
    | "qualified"
    | "call_scheduled"
    | "in_progress"
    | "unqualified"
    | "assigned"
    | "contacted"
    | "follow_up_required"
    | "converted"
    | "lost"
    | "do_not_contact";
  interestLevel: "high" | "medium" | "low" | "unknown";
  qualificationScore?: number;
  qualificationReason?: string;
  qualificationSignals?: string[];
  assignedAgentId?: string;
  assignedSalespersonId?: string;
  assignedSalespersonName?: string;
  lastCallId?: string;
  lastCallDate?: Date;
  followUpAt?: Date;
  scheduledCall?: IScheduledCall;
  doNotContact: boolean;
  notes?: string[];
  interactionTimeline?: Array<{
    id: string;
    actorType: "ai" | "salesperson";
    actorName: string;
    outcome: string;
    reason?: string;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledCallSchema = new Schema<IScheduledCall>(
  {
    scheduledAt: { type: Date, required: true },
    timezone: { type: String, default: "Asia/Kolkata" },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["scheduled", "completed", "missed", "cancelled"],
      default: "scheduled",
    },
    assignedToId: { type: String },
    assignedToName: { type: String },
    autoDialWithAi: { type: Boolean, default: false },
    agentId: { type: String },
    agentName: { type: String },
    bolnaCallId: { type: String },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const LeadSchema = new Schema<ILeadDoc>(
  {
    organizationId: { type: Schema.Types.Mixed, required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    company: { type: String, trim: true },
    location: { type: String },
    budget: { type: String },
    timeline: { type: String },
    industry: { type: String },
    source: { type: String, default: "Manual" },
    customFields: { type: Map, of: Schema.Types.Mixed },
    qualificationStatus: {
      type: String,
      enum: [
        "new",
        "pending_qualification",
        "qualified",
        "call_scheduled",
        "in_progress",
        "unqualified",
        "assigned",
        "contacted",
        "follow_up_required",
        "converted",
        "lost",
        "do_not_contact",
      ],
      default: "new",
      index: true,
    },
    interestLevel: {
      type: String,
      enum: ["high", "medium", "low", "unknown"],
      default: "unknown",
    },
    qualificationScore: { type: Number },
    qualificationReason: { type: String },
    qualificationSignals: [{ type: String }],
    assignedAgentId: { type: Schema.Types.Mixed },
    assignedSalespersonId: { type: Schema.Types.Mixed },
    assignedSalespersonName: { type: String },
    lastCallId: { type: Schema.Types.Mixed },
    lastCallDate: { type: Date },
    followUpAt: { type: Date },
    scheduledCall: { type: ScheduledCallSchema, default: undefined },
    doNotContact: { type: Boolean, default: false },
    notes: [{ type: String }],
    interactionTimeline: [
      {
        id: { type: String },
        actorType: { type: String, enum: ["ai", "salesperson"], default: "salesperson" },
        actorName: { type: String },
        outcome: { type: String },
        reason: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

LeadSchema.index({ organizationId: 1, qualificationStatus: 1 });

const Lead: Model<ILeadDoc> =
  mongoose.models.Lead || mongoose.model<ILeadDoc>("Lead", LeadSchema);

export default Lead;
