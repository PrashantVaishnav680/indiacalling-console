import mongoose, { Document, Schema, Model } from "mongoose";

export interface INotificationDoc extends Document {
  organizationId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: "lead_qualified" | "lead_assigned" | "call_failed" | "campaign_completed" | "system_alert";
  title: string;
  message: string;
  referenceId?: string;
  isRead: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotificationDoc>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["lead_qualified", "lead_assigned", "call_failed", "campaign_completed", "system_alert"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    referenceId: { type: String },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const Notification: Model<INotificationDoc> =
  mongoose.models.Notification || mongoose.model<INotificationDoc>("Notification", NotificationSchema);

export default Notification;

