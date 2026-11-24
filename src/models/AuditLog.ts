import mongoose, { Document, Schema, Model } from "mongoose";

export interface IAuditLogDoc extends Document {
  action: string;
  category:
    | "auth"
    | "organization"
    | "billing"
    | "service_control"
    | "support"
    | "settings"
    | "security";
  actorEmail: string;
  actorName: string;
  targetOrgId?: string;
  targetOrgName?: string;
  details: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLogDoc>(
  {
    action: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: [
        "auth",
        "organization",
        "billing",
        "service_control",
        "support",
        "settings",
        "security",
      ],
      default: "security",
      index: true,
    },
    actorEmail: { type: String, required: true },
    actorName: { type: String, default: "Workspace User" },
    targetOrgId: { type: String },
    targetOrgName: { type: String },
    details: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const AuditLog: Model<IAuditLogDoc> =
  mongoose.models.AuditLog || mongoose.model<IAuditLogDoc>("AuditLog", AuditLogSchema);

export default AuditLog;
