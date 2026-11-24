import mongoose, { Document, Schema, Model } from "mongoose";

export interface ITranscriptDoc extends Document {
  organizationId: any;
  callId: any;
  agentId: string;
  leadId?: string;
  messages: Array<{
    speaker: "agent" | "customer" | "system";
    text: string;
    timestamp: string;
    confidence?: number;
  }>;
  summary: string;
  qualificationResult?: {
    status: string;
    score: number;
    interestLevel: string;
    reason: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const TranscriptSchema = new Schema<ITranscriptDoc>(
  {
    organizationId: { type: Schema.Types.Mixed, required: true, index: true },
    callId: { type: Schema.Types.Mixed, required: true, unique: true, index: true },
    agentId: { type: Schema.Types.Mixed, required: true },
    leadId: { type: Schema.Types.Mixed },
    messages: [
      {
        speaker: { type: String, enum: ["agent", "customer", "system"], required: true },
        text: { type: String, required: true },
        timestamp: { type: String, required: true },
        confidence: { type: Number },
      },
    ],
    summary: { type: String, default: "" },
    qualificationResult: {
      status: { type: String },
      score: { type: Number },
      interestLevel: { type: String },
      reason: { type: String },
    },
  },
  { timestamps: true }
);

const Transcript: Model<ITranscriptDoc> =
  mongoose.models.Transcript ||
  mongoose.model<ITranscriptDoc>("Transcript", TranscriptSchema);

export default Transcript;
