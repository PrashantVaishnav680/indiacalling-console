import mongoose, { Document, Schema, Model } from "mongoose";

export interface IUsageLedgerDoc extends Document {
  organizationId: any;
  callId: any;
  bolnaExecutionId: string;
  agentId: any;
  durationSeconds: number;
  costCents: number;
  provider: string;
  callDirection: "inbound" | "outbound" | "web_call";
  isSimulated: boolean;
  recordedAt: Date;
  createdAt: Date;
}

const UsageLedgerSchema = new Schema<IUsageLedgerDoc>(
  {
    organizationId: { type: Schema.Types.Mixed, required: true, index: true },
    callId: { type: Schema.Types.Mixed, required: true, index: true },
    bolnaExecutionId: { type: String, required: true, unique: true, index: true },
    agentId: { type: Schema.Types.Mixed, required: true },
    durationSeconds: { type: Number, default: 0 },
    costCents: { type: Number, default: 0 },
    provider: { type: String, default: "bolna" },
    callDirection: {
      type: String,
      enum: ["inbound", "outbound", "web_call"],
      default: "outbound",
    },
    isSimulated: { type: Boolean, default: false },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

UsageLedgerSchema.index({ organizationId: 1, recordedAt: -1 });

const UsageLedger: Model<IUsageLedgerDoc> =
  mongoose.models.UsageLedger ||
  mongoose.model<IUsageLedgerDoc>("UsageLedger", UsageLedgerSchema);

export default UsageLedger;
