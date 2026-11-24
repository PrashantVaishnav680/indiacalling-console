import mongoose, { Document, Schema, Model } from "mongoose";

export type PlatformRequestType =
  | "managed_access_request"
  | "enterprise_quote"
  | "quota_increase"
  | "support_request";

export type PlatformRequestDirection = "org_to_admin" | "admin_to_org";

export type PlatformRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed";

export interface IPlatformRequestDoc extends Document {
  organizationId: string;
  organizationName: string;
  type: PlatformRequestType;
  direction: PlatformRequestDirection;
  title: string;
  details: string;
  requestedByEmail: string;
  requestedByName: string;
  status: PlatformRequestStatus;
  resolutionNote?: string;
  resolvedByEmail?: string;
  resolvedAt?: Date | null;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformRequestSchema = new Schema<IPlatformRequestDoc>(
  {
    organizationId: { type: String, required: true, index: true },
    organizationName: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: [
        "managed_access_request",
        "enterprise_quote",
        "quota_increase",
        "support_request",
      ],
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ["org_to_admin", "admin_to_org"],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    details: { type: String, default: "", trim: true },
    requestedByEmail: { type: String, required: true, lowercase: true, trim: true },
    requestedByName: { type: String, default: "User", trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed"],
      default: "pending",
      index: true,
    },
    resolutionNote: { type: String, default: "" },
    resolvedByEmail: { type: String, default: "" },
    resolvedAt: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

PlatformRequestSchema.index({ organizationId: 1, createdAt: -1 });
PlatformRequestSchema.index({ status: 1, createdAt: -1 });

const PlatformRequest: Model<IPlatformRequestDoc> =
  mongoose.models.PlatformRequest ||
  mongoose.model<IPlatformRequestDoc>("PlatformRequest", PlatformRequestSchema);

export default PlatformRequest;
